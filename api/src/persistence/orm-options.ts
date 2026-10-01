/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { LibSqlDriver } from '@mikro-orm/libsql';
import { Migrator } from '@mikro-orm/migrations';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migration20260830000000 } from './migrations/Migration20260830000000.js';
import {
  type PersistenceConfig,
  persistenceConfig,
  tenantSchema,
} from './persistence.config.js';
import { PERSISTENCE_ENTITIES } from './persistence-entities.js';

function sharedOptions(config: PersistenceConfig, tenant: string) {
  return {
    entities: [...PERSISTENCE_ENTITIES],
    extensions: [Migrator],
    migrations: {
      migrationsList: [
        {
          name: Migration20260830000000.name,
          class: Migration20260830000000.seeding(tenant),
        },
      ],
      path: 'dist/persistence/migrations',
      pathTs: 'src/persistence/migrations',
      glob: '!(*.d).{js,ts}',
    },
    debug: config.debug,
  };
}

/**
 * The libSQL database URL of one tenant.
 *
 * With `SQLITE_DATABASE_TEMPLATE`, every tenant uses the template, whose
 * `{tenant}` is replaced. Without it, a single tenant uses `DATABASE_URL`
 * unchanged; several local `file:` tenants get a filename suffix; several
 * remote tenants are rejected, so a hostname is never altered.
 *
 * @throws {Error} When the template lacks `{tenant}`, or several remote
 *   tenants have no template.
 *
 * @example
 * ```ts
 * // DATABASE_URL=file:local.db SQLITE_TENANTS=tenant_a
 * libsqlDbUrl('tenant_a', persistenceConfig()); // 'file:local-tenant_a.db'
 * ```
 */
export function libsqlDbUrl(tenant: string, config: PersistenceConfig): string {
  const { url, template } = config.libsql;
  if (template !== undefined) {
    if (!template.includes('{tenant}')) {
      throw new Error('SQLITE_DATABASE_TEMPLATE must contain {tenant}.');
    }
    return template.replaceAll('{tenant}', tenant);
  }

  if (config.tenants.length === 1) return url;

  if (!url.startsWith('file:')) {
    throw new Error(
      'Multiple remote libSQL tenants require SQLITE_DATABASE_TEMPLATE with {tenant}.',
    );
  }

  const slashIndex = url.lastIndexOf('/');
  const dotIndex = url.lastIndexOf('.');
  if (dotIndex > slashIndex) {
    return `${url.slice(0, dotIndex)}-${tenant}${url.slice(dotIndex)}`;
  }
  return `${url}-${tenant}`;
}

/**
 * MikroORM options for one libSQL database.
 *
 * @param dbName - Database URL, usually from {@link libsqlDbUrl}.
 * @param tenant - The tenant the migrations' demo seed is named after.
 *   Default: the default schema.
 *
 * @example
 * ```ts
 * const config = persistenceConfig();
 * const orm = await MikroORM.init(
 *   createLibsqlOrmOptions(libsqlDbUrl('tenant_a', config), 'tenant_a'),
 * );
 * ```
 */
export function createLibsqlOrmOptions(dbName: string, tenant?: string) {
  const config = persistenceConfig();
  return {
    ...sharedOptions(config, tenant ?? config.defaultSchema),
    driver: LibSqlDriver,
    dbName,
    password: config.libsql.authToken,
  };
}

/**
 * MikroORM options for the PostgreSQL database, bound to one tenant schema.
 *
 * @param schema - Tenant schema, which the migrations' demo seed is also named
 *   after. Default: the default schema.
 * @throws {InvalidTenantSchemaError} When `schema` is not a valid name.
 *
 * @example
 * ```ts
 * const orm = await MikroORM.init(createPostgresOrmOptions('tenant_a'));
 * ```
 */
export function createPostgresOrmOptions(schema?: string) {
  const config = persistenceConfig();
  const tenant =
    schema === undefined ? config.defaultSchema : tenantSchema(schema);
  const shared = sharedOptions(config, tenant);
  return {
    ...shared,
    driver: PostgreSqlDriver,
    ...config.postgres,
    schema: tenant,
    migrations: { ...shared.migrations, schema: tenant },
  };
}
