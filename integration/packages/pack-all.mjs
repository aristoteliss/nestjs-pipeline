import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packagesDir = resolve(root, 'packages');
const outputDir = resolve(root, '.tmp/packed-packages');

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(
      `${command} ${args.join(' ')} failed with status ${result.status}`,
    );
  }

  return result.stdout;
}

const packageDirs = readdirSync(packagesDir)
  .map((name) => resolve(packagesDir, name))
  .filter((dir) => existsSync(resolve(dir, 'package.json')));

let packedCount = 0;
for (const dir of packageDirs) {
  const manifest = JSON.parse(
    readFileSync(resolve(dir, 'package.json'), 'utf8'),
  );

  if (manifest.private === true) continue;

  run('pnpm', ['pack', '--pack-destination', outputDir], dir);
  packedCount += 1;
}

process.stdout.write(
  `Packed ${packedCount} package directories into ${outputDir}.\n`,
);
