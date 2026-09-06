import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCache = mkdtempSync(join(tmpdir(), 'pipeline-npm-pack-'));
const packageDirectories = readdirSync(join(root, 'packages'), {
  withFileTypes: true,
})
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(root, 'packages', entry.name))
  .filter((directory) => {
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json')));
    return manifest.private !== true;
  });

try {
  for (const directory of packageDirectories) {
    const packed = spawnSync('npm', ['pack', '--dry-run', '--json'], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, npm_config_cache: npmCache },
    });
    // A failed npm pack may skip postpack, so always run the marker-aware cleanup.
    spawnSync(
      process.execPath,
      [join(root, 'scripts/package-licenses.mjs'), 'cleanup'],
      { cwd: directory },
    );
    if (packed.status !== 0) {
      throw new Error(
        `npm pack failed in ${directory}: ${packed.stderr || packed.stdout || `exit ${packed.status}`}`,
      );
    }

    const report = JSON.parse(packed.stdout);
    const paths = new Set(report[0].files.map((file) => file.path));
    for (const required of ['README.md', 'LICENSE', 'COMMERCIAL_LICENSE.txt']) {
      if (!paths.has(required)) {
        throw new Error(`${report[0].name} tarball is missing ${required}.`);
      }
    }
    console.log(`verified ${report[0].name}`);
  }
} finally {
  rmSync(npmCache, { recursive: true, force: true });
}
