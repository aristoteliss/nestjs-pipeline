/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { loadOptionalEnvFile } from '@common/environment/load-optional-env-file';
import { persistenceConfig } from './persistence.config';
import { forEachTenantOrm } from './tenant-orms';

export async function migrate(): Promise<number> {
  const postgres = persistenceConfig().engine === 'postgres';
  let total = 0;

  await forEachTenantOrm(async (orm, tenant) => {
    const originalSeedTenant = process.env.SEED_TENANT;
    try {
      process.env.SEED_TENANT = tenant;
      if (postgres) {
        await orm.em
          .getConnection()
          .execute(`create schema if not exists "${tenant}";`);
      }
      const executed = postgres
        ? await orm.migrator.up({ schema: tenant })
        : await orm.migrator.up();
      total += Array.isArray(executed) ? executed.length : 0;
    } finally {
      process.env.SEED_TENANT = originalSeedTenant;
    }
  });

  return total;
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith('/migrate.ts') ||
    process.argv[1].endsWith('/migrate.js'))
) {
  (async () => {
    loadOptionalEnvFile();
    const applied = await migrate();
    console.log(
      applied > 0
        ? `Done - ${applied} migration(s) applied.`
        : 'Already up to date.',
    );
  })();
}
