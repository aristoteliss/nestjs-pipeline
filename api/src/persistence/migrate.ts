/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { persistenceConfig } from './persistence.config.js';
import { forEachTenantOrm } from './tenant-orms.js';

/**
 * Applies the pending migrations in every tenant, creating a PostgreSQL tenant
 * schema first when it is missing, and returns how many ran in all.
 */
export async function migrate(): Promise<number> {
  const postgres = persistenceConfig().engine === 'postgres';
  let total = 0;

  await forEachTenantOrm(async (orm, tenant) => {
    if (postgres) {
      await orm.em
        .getConnection()
        .execute(`create schema if not exists "${tenant}";`);
    }
    total += (await orm.migrator.up()).length;
  });

  return total;
}
