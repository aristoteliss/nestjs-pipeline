/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MikroORM } from '@mikro-orm/core';
import { LibSqlDriver } from '@mikro-orm/libsql';
import {
  createLibsqlOrmOptions,
  createPostgresOrmOptions,
  libsqlDbUrl,
} from './orm-options.js';
import { persistenceConfig } from './persistence.config.js';

/**
 * Runs `task` once per configured tenant with an ORM bound to that tenant's
 * schema (PostgreSQL) or database (libSQL), closing each ORM afterwards.
 */
export async function forEachTenantOrm<T>(
  task: (orm: MikroORM, tenant: string) => Promise<T>,
): Promise<Map<string, T>> {
  const config = persistenceConfig();
  const results = new Map<string, T>();

  for (const tenant of config.tenants) {
    const orm =
      config.engine === 'postgres'
        ? await MikroORM.init(createPostgresOrmOptions(tenant))
        : await MikroORM.init<LibSqlDriver>(
            createLibsqlOrmOptions(libsqlDbUrl(tenant, config), tenant),
          );
    try {
      results.set(tenant, await task(orm, tenant));
    } finally {
      await orm.close();
    }
  }
  return results;
}
