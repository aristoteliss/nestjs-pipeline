/* Copyright (C) 2026-present Aristotelis — see repository license. */

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

/**
 * Runs `task` once per configured tenant with an ORM bound to that tenant's
 * schema (PostgreSQL) or database (libSQL), closing each ORM afterwards.
 * Tenants are enumerated the same way `migrate.ts` does.
 */
export async function forEachTenantOrm<T>(
  task: (orm: MikroORM, tenant: string) => Promise<T>,
): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  const postgres = isPostgresEngine();
  const tenants = postgres ? parseSchemas() : resolveLibsqlTenants();

  for (const tenant of tenants) {
    const orm = postgres
      ? await MikroORM.init(createPostgresOrmOptions(tenant))
      : await MikroORM.init<LibSqlDriver>(
          createLibsqlOrmOptions(resolveLibsqlDbUrl(tenant)),
        );
    try {
      results.set(tenant, await task(orm, tenant));
    } finally {
      await orm.close();
    }
  }
  return results;
}
