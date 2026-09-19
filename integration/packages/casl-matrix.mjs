import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packedDir = resolve(root, '.tmp/packed-packages');
const consumerTemplateDir = resolve(root, 'integration/packages/consumer');
const consumerDir = resolve(root, '.tmp/consumer');
const tscBin = resolve(root, 'node_modules/.bin/tsc');

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
      `${command} ${args.join(' ')} failed in ${cwd} with status ${result.status}`,
    );
  }

  return result.stdout;
}

const tarballs = readdirSync(packedDir);
const coreTarballName = tarballs.find(
  (name) => name.startsWith('nestjs-pipeline-core-') && name.endsWith('.tgz'),
);
const caslTarballName = tarballs.find(
  (name) => name.startsWith('nestjs-pipeline-casl-') && name.endsWith('.tgz'),
);

if (!coreTarballName) {
  throw new Error('Core tarball not found in .tmp/packed-packages');
}
if (!caslTarballName) {
  throw new Error('CASL tarball not found in .tmp/packed-packages');
}

const coreTarballPath = resolve(packedDir, coreTarballName);
const caslTarballPath = resolve(packedDir, caslTarballName);

function setupConsumer(dependencies, sourceFiles) {
  rmSync(consumerDir, { recursive: true, force: true });
  mkdirSync(consumerDir, { recursive: true });
  mkdirSync(resolve(consumerDir, 'src'), { recursive: true });

  // Isolate consumer from monorepo workspace
  writeFileSync(resolve(consumerDir, 'pnpm-workspace.yaml'), 'packages: []\n');

  const packageJson = {
    name: 'packed-consumer-smoke',
    private: true,
    version: '1.0.0',
    dependencies,
  };

  writeFileSync(
    resolve(consumerDir, 'package.json'),
    JSON.stringify(packageJson, null, 2),
  );

  copyFileSync(
    resolve(consumerTemplateDir, 'tsconfig.json'),
    resolve(consumerDir, 'tsconfig.json'),
  );

  for (const srcFile of sourceFiles) {
    copyFileSync(
      resolve(consumerTemplateDir, 'src', srcFile),
      resolve(consumerDir, 'src', srcFile),
    );
  }

  run('pnpm', ['install', '--prefer-offline'], consumerDir);
  run(tscBin, ['-p', 'tsconfig.json'], consumerDir);
}

// 1. Base smoke & two-app lifecycle with packed core
process.stdout.write(
  'Testing packed @nestjs-pipeline/core smoke & lifecycle...\n',
);
setupConsumer(
  {
    '@nestjs/common': '^11.2.1',
    '@nestjs/core': '^11.2.1',
    '@nestjs/cqrs': '^11.0.3',
    'reflect-metadata': '^0.2.2',
    rxjs: '^7.8.1',
    '@nestjs-pipeline/core': coreTarballPath,
  },
  ['smoke.ts', 'two-app-lifecycle.ts'],
);

run('node', ['dist/smoke.js'], consumerDir);
process.stdout.write('  ✓ Packed core smoke test passed.\n');

run('node', ['dist/two-app-lifecycle.js'], consumerDir);
process.stdout.write('  ✓ Packed core two-app lifecycle test passed.\n');

// 2. CASL matrix testing across advertised peer ranges: ^6.0.0 and ^7.0.0
for (const caslVersion of ['^6.0.0', '^7.0.0']) {
  process.stdout.write(
    `Testing packed @nestjs-pipeline/casl with @casl/ability ${caslVersion}...\n`,
  );
  setupConsumer(
    {
      '@nestjs/common': '^11.2.1',
      '@nestjs/core': '^11.2.1',
      '@nestjs/cqrs': '^11.0.3',
      'reflect-metadata': '^0.2.2',
      rxjs: '^7.8.1',
      '@casl/ability': caslVersion,
      '@nestjs-pipeline/core': coreTarballPath,
      '@nestjs-pipeline/casl': caslTarballPath,
    },
    ['casl-smoke.ts'],
  );

  const output = run('node', ['dist/casl-smoke.js'], consumerDir);
  if (!output.includes('CASL smoke contract passed')) {
    throw new Error(`CASL smoke test failed for ${caslVersion}: ${output}`);
  }
  process.stdout.write(
    `  ✓ CASL smoke test passed for @casl/ability ${caslVersion}.\n`,
  );
}

process.stdout.write(
  'All packed-consumer release compatibility checks passed.\n',
);
