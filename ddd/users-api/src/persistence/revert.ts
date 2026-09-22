/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { loadOptionalEnvFile } from '@common/environment/load-optional-env-file';
import { forEachTenantOrm } from './tenant-orms';

function parseSteps(argv: string[]): number {
  const args = argv.slice(2);

  const inline = args.find((arg) => arg.startsWith('--steps='));
  if (inline) {
    const value = Number.parseInt(inline.split('=')[1] ?? '', 10);
    if (!Number.isNaN(value) && value > 0) {
      return value;
    }
    throw new Error('--steps must be a positive integer.');
  }

  const stepsIndex = args.indexOf('--steps');
  if (stepsIndex >= 0) {
    const next = args[stepsIndex + 1];
    const value = Number.parseInt(next ?? '', 10);
    if (!Number.isNaN(value) && value > 0) {
      return value;
    }
    throw new Error('--steps must be a positive integer.');
  }

  const positional = args.find((arg) => /^\d+$/.test(arg));
  if (positional) {
    return Number.parseInt(positional, 10);
  }

  return 1;
}

export async function revert(steps = 1): Promise<number> {
  const postgres = (process.env.DB_ENGINE ?? '').toLowerCase() === 'postgres';
  let total = 0;

  await forEachTenantOrm(async (orm, tenant) => {
    for (let i = 0; i < steps; i += 1) {
      const reverted = postgres
        ? await orm.migrator.down({ schema: tenant })
        : await orm.migrator.down();
      const count = Array.isArray(reverted) ? reverted.length : 0;
      if (count === 0) break;
      total += count;
    }
  });

  return total;
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('/revert.ts') ||
    process.argv[1].endsWith('/revert.js'))
) {
  (async () => {
    loadOptionalEnvFile();
    const steps = parseSteps(process.argv);
    const reverted = await revert(steps);
    console.log(
      reverted > 0
        ? `Done - ${reverted} migration(s) reverted.`
        : 'Nothing to revert.',
    );
  })();
}
