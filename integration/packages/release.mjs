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
const nodeEngine = readJson(resolve(root, 'package.json')).engines.node;
// A package whose required peer needs a newer Node declares that peer's range.
const peerNodeEngines = new Map([
  [
    '@cqrs-ddd/mikro-orm',
    readJson(
      resolve(
        root,
        'packages/ddd-mikro-orm/node_modules/@mikro-orm/core/package.json',
      ),
    ).engines.node.replace(/\s+/g, ''),
  ],
]);
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, stdio: 'inherit' });
const tar = (args) => execFileSync('tar', args, { encoding: 'utf8' });
try {
  execFileSync('bun', ['--version'], { stdio: 'ignore' });
} catch (error) {
  throw new Error(
    'The release check loads every package in Bun: install Bun (https://bun.sh) and put it on PATH.',
    { cause: error },
  );
}
// One release line per run (`0.4` by default): the 0.4.x packages keep receiving fixes,
// and the 0.5 NestJS adapters peer the @cqrs-ddd 0.5 packages; the two lines would
// install two versions of @cqrs-ddd/core into one consumer.
const line = process.argv[2] ?? '0.4';
const packages = readdirSync(resolve(root, 'packages'))
  .sort()
  .flatMap((name) => {
    const dir = resolve(root, 'packages', name);
    const path = resolve(dir, 'package.json');
    if (!existsSync(path)) return [];
    const manifest = readJson(path);
    return manifest.private === true || !manifest.version.startsWith(`${line}.`)
      ? []
      : [{ dir, manifest }];
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
      'README.md',
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
    const readme = tar(['-xzf', path, '-O', 'package/README.md']);
    if (/\]\(\.\.\//.test(readme)) {
      throw new Error(
        `${file}: README links outside the package, which break on npmjs.com`,
      );
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
    const requiredNodeEngine = peerNodeEngines.get(manifest.name) ?? nodeEngine;
    if (manifest.engines?.node !== requiredNodeEngine) {
      throw new Error(
        `${manifest.name}: engines.node must be "${requiredNodeEngine}", found "${manifest.engines?.node}"`,
      );
    }
    for (const field of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (
          range.startsWith('workspace:') ||
          /(?:^|[/:])api\//.test(range) ||
          (name === '@cqrs-ddd/core' &&
            !manifest.name.startsWith('@cqrs-ddd/')) ||
          name === '@nestjs-pipeline/ddd-api'
        ) {
          throw new Error(
            `${manifest.name}: invalid published dependency ${name}: ${range}`,
          );
        }
      }
    }
    for (const name of Object.keys(manifest.peerDependencies ?? {})) {
      // The 0.4 line proves packages load without their optional peers; each entry
      // point of the 0.5 adapter needs its own optional peer, and every entry point
      // is loaded below.
      if (line === '0.4' && manifest.peerDependenciesMeta?.[name]?.optional) {
        continue;
      }
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

  // pnpm reads overrides from the workspace file only, so a packed package that
  // depends on another packed one resolves to its tarball, never to the registry.
  writeFileSync(
    resolve(consumer, 'pnpm-workspace.yaml'),
    [
      'packages: []',
      'autoInstallPeers: false',
      'strictPeerDependencies: true',
      'linkWorkspacePackages: false',
      'overrides:',
      ...Object.entries(packedDependencies).map(
        ([name, spec]) => `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`,
      ),
      '',
    ].join('\n'),
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
      },
      null,
      2,
    ),
  );
  for (const file of ['tsconfig.json', 'tsconfig.bundler.json']) {
    copyFileSync(resolve(template, file), resolve(consumer, file));
  }
  const fixtureDir = resolve(template, line === '0.4' ? 'src' : `src-${line}`);
  const fixtures = readdirSync(fixtureDir).filter((name) =>
    name.endsWith('.ts'),
  );
  for (const file of fixtures) {
    copyFileSync(resolve(fixtureDir, file), resolve(consumer, 'src', file));
  }
  // Static namespace imports exercise declarations and survive compilation into runtime loads.
  writeFileSync(
    resolve(consumer, 'src/all-packages.ts'),
    [
      "import 'reflect-metadata';",
      ...[...expected.keys()]
        .filter((name) => !name.startsWith('@cqrs-ddd/'))
        .map(
          (name, index) =>
            `import * as package${index} from ${JSON.stringify(name)};\nconsole.log(${JSON.stringify(name)}, Object.keys(package${index}).length);`,
        ),
    ].join('\n'),
  );

  // Every entry point, subpaths included, from an ES module consumer and from Bun.
  const entryPoints = [...expected.values()].flatMap((manifest) =>
    Object.keys(manifest.exports ?? { '.': null })
      .filter((key) => key !== './package.json')
      .map((key) =>
        key === '.' ? manifest.name : `${manifest.name}${key.slice(1)}`,
      ),
  );
  writeFileSync(
    resolve(consumer, 'src/all-packages.mts'),
    [
      "import 'reflect-metadata';",
      ...entryPoints.map(
        (name, index) =>
          `import * as entry${index} from ${JSON.stringify(name)};\nif (!Object.keys(entry${index}).length) throw new Error(${JSON.stringify(`${name}: no exports`)});\nconsole.log('import', ${JSON.stringify(name)}, Object.keys(entry${index}).length);`,
      ),
    ].join('\n'),
  );
  writeFileSync(
    resolve(consumer, 'bun-load.mjs'),
    [
      "import 'reflect-metadata';",
      "import { createRequire } from 'node:module';",
      'const require = createRequire(import.meta.url);',
      "const names = (namespace) => Object.keys(namespace).filter((key) => !['default', '__esModule', 'module.exports'].includes(key)).sort().join();",
      `for (const name of ${JSON.stringify(entryPoints)}) {`,
      '  const imported = names(await import(name));',
      '  const required = names(require(name));',
      "  if (!imported || imported !== required) throw new Error(name + ': import and require() differ in Bun');",
      "  console.log('bun', name, imported.split(',').length);",
      '}',
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
  run('node', ['dist/all-packages.mjs'], consumer);
  run(
    resolve(root, 'node_modules/.bin/tsc'),
    ['-p', 'tsconfig.bundler.json'],
    consumer,
  );
  run('bun', ['bun-load.mjs'], consumer);

  // Framework-neutral packages must work with nothing else installed: each gets an
  // empty consumer holding only its tarball, its peers and the packed packages
  // they depend on, and must load without NestJS.
  const neutral = [...expected.values()].filter(
    (manifest) =>
      manifest.name.startsWith('@cqrs-ddd/') &&
      !Object.keys(manifest.peerDependencies ?? {}).some((name) =>
        name.startsWith('@nestjs/'),
      ),
  );
  for (const [index, manifest] of neutral.entries()) {
    const own = Object.keys(manifest.dependencies ?? {});
    const foreign = own.filter((name) => !packedDependencies[name]);
    if (foreign.length) {
      throw new Error(
        `${manifest.name}: depends on packages outside this release: ${foreign.join(', ')}`,
      );
    }
    // The version the package is developed and tested against.
    const sourceDir = packages.find(
      (entry) => entry.manifest.name === manifest.name,
    ).dir;
    const peers = Object.keys(manifest.peerDependencies ?? {});
    const external = peers.filter((name) => !packedDependencies[name]);
    const externalManifest = (name) =>
      readJson(resolve(sourceDir, 'node_modules', name, 'package.json'));
    // Packed packages reachable from the package and its packed peers.
    const packedClosure = new Set();
    const visit = (name) => {
      if (!packedDependencies[name] || packedClosure.has(name)) return;
      packedClosure.add(name);
      for (const dependency of Object.keys(
        expected.get(name).dependencies ?? {},
      )) {
        visit(dependency);
      }
    };
    for (const name of [manifest.name, ...peers]) visit(name);
    const allowed = [
      ...packedClosure,
      ...external,
      ...external.flatMap((name) =>
        Object.keys(externalManifest(name).dependencies ?? {}),
      ),
    ];
    const overrides = Object.fromEntries(
      [...packedClosure].map((name) => [name, packedDependencies[name]]),
    );
    const alone = resolve(temporary, `standalone-${index}`);
    mkdirSync(alone);
    writeFileSync(
      resolve(alone, 'pnpm-workspace.yaml'),
      [
        'packages: []',
        'autoInstallPeers: false',
        'strictPeerDependencies: true',
        'overrides:',
        ...Object.entries(overrides).map(
          ([name, spec]) =>
            `  ${JSON.stringify(name)}: ${JSON.stringify(spec)}`,
        ),
        '',
      ].join('\n'),
    );
    writeFileSync(
      resolve(alone, 'package.json'),
      JSON.stringify(
        {
          name: 'packed-standalone-smoke',
          private: true,
          version: '1.0.0',
          dependencies: Object.fromEntries(
            [manifest.name, ...peers].map((name) => [
              name,
              packedDependencies[name] ?? externalManifest(name).version,
            ]),
          ),
        },
        null,
        2,
      ),
    );
    run('pnpm', ['install', '--prefer-offline'], alone);
    const installed = new Set();
    const collect = (tree) => {
      for (const [name, entry] of Object.entries(tree ?? {})) {
        installed.add(name);
        collect(entry.dependencies);
      }
    };
    const projects = JSON.parse(
      execFileSync('pnpm', ['ls', '--json', '--depth', 'Infinity'], {
        cwd: alone,
        encoding: 'utf8',
      }),
    );
    for (const project of projects) collect(project.dependencies);
    const extra = [...installed].filter((name) => !allowed.includes(name));
    if (extra.length) {
      throw new Error(
        `${manifest.name}: standalone install also installed ${extra.join(', ')}`,
      );
    }

    const entries = Object.keys(manifest.exports ?? { '.': null }).map((key) =>
      key === '.' ? manifest.name : `${manifest.name}${key.slice(1)}`,
    );
    run(
      'node',
      [
        '-e',
        `for (const s of ${JSON.stringify(entries)}) { const n = Object.keys(require(s)).length; if (!n) throw new Error(s + ': no exports'); console.log('standalone', s, n); }`,
      ],
      alone,
    );
  }
  console.log(
    `Release verification passed: ${seen.size} packed packages (${neutral.length} standalone), CommonJS and ES module consumers, Bundler types, Bun, core lifecycle, CASL 7.`,
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
