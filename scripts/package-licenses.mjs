import {
  copyFileSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = process.cwd();
const markerPath = join(packageRoot, '.package-licenses.generated');
const licenseNames = ['LICENSE', 'COMMERCIAL_LICENSE.txt'];

if (process.argv[2] === 'prepare') {
  // Preserve a previous interrupted pack's marker so a later postpack still
  // knows which package-local files are generated and safe to remove.
  const created = existsSync(markerPath)
    ? JSON.parse(readFileSync(markerPath, 'utf8'))
    : [];
  for (const name of licenseNames) {
    const target = join(packageRoot, name);
    if (existsSync(target)) continue;
    copyFileSync(join(repositoryRoot, name), target);
    if (!created.includes(name)) created.push(name);
  }
  writeFileSync(markerPath, JSON.stringify(created));
} else if (process.argv[2] === 'cleanup') {
  if (!existsSync(markerPath)) process.exit(0);
  const created = JSON.parse(readFileSync(markerPath, 'utf8'));
  for (const name of created) rmSync(join(packageRoot, name));
  rmSync(markerPath);
} else {
  throw new Error('Expected "prepare" or "cleanup".');
}
