/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { loadOptionalEnvFile } from '@common/environment/load-optional-env-file';
import { MikroORM } from '@mikro-orm/core';
import { LibSqlDriver } from '@mikro-orm/libsql';
import {
  createLibsqlOrmOptions,
  resolveLibsqlDbUrl,
  resolveLibsqlTenants,
} from './libsql-options';
import {
  createPostgresOrmOptions,
  normalizeSchemaName,
} from './postgres-options';

function isPostgresEngine(): boolean {
  return (process.env.DB_ENGINE ?? '').toLowerCase() === 'postgres';
}

function parseSchemas(): string[] {
  const list = process.env.TENANT_SCHEMAS ?? process.env.DB_DEFAULT_SCHEMA;
  if (!list) {
    return [normalizeSchemaName(undefined)];
  }

  return list
    .split(',')
    .map((value) => normalizeSchemaName(value))
    .filter((value, index, all) => all.indexOf(value) === index);
}

async function migrateSchema(schema: string): Promise<number> {
  const originalSeedTenant = process.env.SEED_TENANT;
  const orm = await MikroORM.init(createPostgresOrmOptions(schema));

  try {
    process.env.SEED_TENANT = schema;
    await orm.em
      .getConnection()
      .execute(`create schema if not exists "${schema}";`);
    const executed = await orm.migrator.up();
    return Array.isArray(executed) ? executed.length : 0;
  } finally {
    process.env.SEED_TENANT = originalSeedTenant;
    await orm.close();
  }
}

async function migrateLibsqlTenant(tenant: string): Promise<number> {
  const originalSeedTenant = process.env.SEED_TENANT;
  const dbName = resolveLibsqlDbUrl(tenant);
  const orm = await MikroORM.init<LibSqlDriver>(createLibsqlOrmOptions(dbName));

  try {
    process.env.SEED_TENANT = tenant;
    const executed = await orm.migrator.up();
    return Array.isArray(executed) ? executed.length : 0;
  } finally {
    process.env.SEED_TENANT = originalSeedTenant;
    await orm.close();
  }
}

async function migrateLibsql(): Promise<number> {
  const tenants = resolveLibsqlTenants();
  let total = 0;

  for (const tenant of tenants) {
    total += await migrateLibsqlTenant(tenant);
  }

  return total;
}

export async function migrate(): Promise<number> {
  if (!isPostgresEngine()) {
    return migrateLibsql();
  }

  const schemas = parseSchemas();
  let total = 0;

  for (const schema of schemas) {
    total += await migrateSchema(schema);
  }

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
