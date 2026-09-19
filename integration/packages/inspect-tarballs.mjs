import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packed = resolve(root, '.tmp/packed-packages');

function listTarball(path) {
  const result = spawnSync('tar', ['-tf', path], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr);

  return result.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractTarballFile(tarPath, filePath) {
  const result = spawnSync('tar', ['-xzf', tarPath, '-O', filePath], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

const tarballs = readdirSync(packed).filter((name) => name.endsWith('.tgz'));
if (tarballs.length < 12) {
  throw new Error(
    `Expected at least 12 packed tarballs, found ${tarballs.length}`,
  );
}

for (const file of tarballs) {
  const tarPath = resolve(packed, file);
  const entries = listTarball(tarPath);

  const requireEntry = (suffix) => {
    if (!entries.some((entry) => entry.endsWith(suffix))) {
      throw new Error(`${file} is missing ${suffix}`);
    }
  };

  requireEntry('package/package.json');
  requireEntry('package/LICENSE');
  requireEntry('package/COMMERCIAL_LICENSE.txt');

  if (!entries.some((entry) => /package\/dist\/.*\.js$/.test(entry))) {
    throw new Error(`${file} contains no runtime JS under dist/`);
  }

  if (!entries.some((entry) => /package\/dist\/.*\.d\.ts$/.test(entry))) {
    throw new Error(`${file} contains no declaration files under dist/`);
  }

  const forbidden = entries.filter(
    (entry) => /\.spec\.[cm]?tsx?$/.test(entry) || /\/test\//.test(entry),
  );

  if (forbidden.length > 0) {
    throw new Error(
      `${basename(file)} unexpectedly ships tests:\n${forbidden.join('\n')}`,
    );
  }

  // Inspect package.json inside tarball to ensure no workspace: protocol or ddd/ references remain
  const manifestContent = extractTarballFile(tarPath, 'package/package.json');
  const manifest = JSON.parse(manifestContent);

  for (const depKey of [
    'dependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    const deps = manifest[depKey] || {};
    for (const [name, version] of Object.entries(deps)) {
      if (typeof version === 'string') {
        if (version.startsWith('workspace:')) {
          throw new Error(
            `${file} manifest ${depKey}['${name}'] still contains unresolved workspace protocol: '${version}'`,
          );
        }
        if (
          version.includes('ddd/') ||
          name.includes('ddd-core') ||
          name.includes('users-api')
        ) {
          throw new Error(
            `${file} manifest ${depKey}['${name}'] references private ddd workspace: '${version}'`,
          );
        }
      }
    }
  }
}

process.stdout.write(
  `Successfully inspected ${tarballs.length} packed tarballs. All contract assertions passed.\n`,
);
