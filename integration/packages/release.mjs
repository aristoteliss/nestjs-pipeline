import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const template = resolve(import.meta.dirname, 'consumer');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, stdio: 'inherit' });
const tar = (args) => execFileSync('tar', args, { encoding: 'utf8' });
const packages = readdirSync(resolve(root, 'packages'))
  .sort()
  .flatMap((name) => {
    const dir = resolve(root, 'packages', name);
    const path = resolve(dir, 'package.json');
    if (!existsSync(path)) return [];
    const manifest = readJson(path);
    return manifest.private === true ? [] : [{ dir, manifest }];
  });
const expected = new Map(
  packages.map(({ manifest }) => [manifest.name, manifest]),
);
if (!packages.length || expected.size !== packages.length) {
  throw new Error('Expected nonempty, unique publishable package names');
}

// Outside the checkout: ancestor node_modules must not satisfy undeclared dependencies.
const temporary = mkdtempSync(resolve(tmpdir(), 'pipeline-release-'));
try {
  const packed = resolve(temporary, 'packed');
  const consumer = resolve(temporary, 'consumer');
  mkdirSync(packed);
  mkdirSync(resolve(consumer, 'src'), { recursive: true });
  for (const { dir, manifest } of packages) {
    console.log(`Packing ${manifest.name}`);
    run('pnpm', ['pack', '--pack-destination', packed], dir);
  }

  const dependencies = {};
  // Use the installed lockfile graph, including required peers of external peers.
  function addPeer(name, from) {
    if (expected.has(name) || dependencies[name]) return;
    const require = createRequire(from);
    let dir = dirname(require.resolve(name));
    while (
      !existsSync(resolve(dir, 'package.json')) ||
      readJson(resolve(dir, 'package.json')).name !== name
    ) {
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`Cannot locate manifest for ${name}`);
      dir = parent;
    }
    const path = resolve(dir, 'package.json');
    const manifest = readJson(path);
    dependencies[name] = manifest.version;
    for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
      if (!manifest.peerDependenciesMeta?.[peer]?.optional) addPeer(peer, path);
    }
  }
  const packedDependencies = {};
  const seen = new Set();
  for (const file of readdirSync(packed).filter((name) =>
    name.endsWith('.tgz'),
  )) {
    const path = resolve(packed, file);
    const entries = tar(['-tf', path]).trim().split('\n');
    for (const required of [
      'package.json',
      'LICENSE',
      'COMMERCIAL_LICENSE.txt',
    ]) {
      if (!entries.includes(`package/${required}`))
        throw new Error(`${file}: missing ${required}`);
    }
    if (
      !entries.some((entry) => /^package\/dist\/.*\.js$/.test(entry)) ||
      !entries.some((entry) => /^package\/dist\/.*\.d\.ts$/.test(entry))
    ) {
      throw new Error(`${file}: missing runtime JS or declarations`);
    }
    if (
      entries.some(
        (entry) =>
          /\.(spec|test)\.[cm]?[jt]sx?$/.test(entry) ||
          /\/(test|tests|__tests__)\//.test(entry),
      )
    ) {
      throw new Error(`${file}: ships test files`);
    }
    const manifest = JSON.parse(
      tar(['-xzf', path, '-O', 'package/package.json']),
    );
    const source = expected.get(manifest.name);
    if (
      !source ||
      source.version !== manifest.version ||
      seen.has(manifest.name)
    ) {
      throw new Error(
        `${file}: unexpected, duplicate, or wrong-version package`,
      );
    }
    seen.add(manifest.name);
    packedDependencies[manifest.name] = `file:${path}`;
    for (const field of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (
          range.startsWith('workspace:') ||
          range.includes('ddd/') ||
          name.includes('ddd-core') ||
          name.includes('users-api')
        ) {
          throw new Error(
            `${manifest.name}: invalid published dependency ${name}: ${range}`,
          );
        }
      }
    }
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      if (manifest.peerDependenciesMeta?.[name]?.optional) continue;
      const sourceDir = packages.find(
        (entry) => entry.manifest.name === manifest.name,
      ).dir;
      addPeer(name, resolve(sourceDir, 'package.json'));
    }
  }
  if (seen.size !== expected.size) {
    throw new Error(
      `Missing tarballs: ${[...expected.keys()].filter((name) => !seen.has(name)).join(', ')}`,
    );
  }

  writeFileSync(
    resolve(consumer, 'pnpm-workspace.yaml'),
    'packages: []\nautoInstallPeers: false\nstrictPeerDependencies: true\nlinkWorkspacePackages: false\n',
  );
  writeFileSync(
    resolve(consumer, 'package.json'),
    JSON.stringify(
      {
        name: 'packed-consumer-smoke',
        private: true,
        version: '1.0.0',
        dependencies: { ...dependencies, ...packedDependencies },
        devDependencies: {
          '@types/node': readJson(
            resolve(root, 'node_modules/@types/node/package.json'),
          ).version,
        },
        pnpm: { overrides: packedDependencies },
      },
      null,
      2,
    ),
  );
  copyFileSync(
    resolve(template, 'tsconfig.json'),
    resolve(consumer, 'tsconfig.json'),
  );
  const fixtures = readdirSync(resolve(template, 'src')).filter((name) =>
    name.endsWith('.ts'),
  );
  for (const file of fixtures) {
    copyFileSync(
      resolve(template, 'src', file),
      resolve(consumer, 'src', file),
    );
  }
  // Static namespace imports exercise declarations and survive compilation into runtime loads.
  writeFileSync(
    resolve(consumer, 'src/all-packages.ts'),
    [
      "import 'reflect-metadata';",
      ...[...expected.keys()].map(
        (name, index) =>
          `import * as package${index} from ${JSON.stringify(name)};\nconsole.log(${JSON.stringify(name)}, Object.keys(package${index}).length);`,
      ),
    ].join('\n'),
  );

  run(
    'pnpm',
    [
      'install',
      '--prefer-offline',
      '--strict-peer-dependencies',
      '--config.auto-install-peers=false',
    ],
    consumer,
  );
  run(
    resolve(root, 'node_modules/.bin/tsc'),
    ['-p', 'tsconfig.json'],
    consumer,
  );
  for (const file of ['all-packages.ts', ...fixtures]) {
    run('node', [`dist/${file.replace(/\.ts$/, '.js')}`], consumer);
  }
  console.log(
    `Release verification passed: ${seen.size} packed packages, core lifecycle, CASL 7.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
