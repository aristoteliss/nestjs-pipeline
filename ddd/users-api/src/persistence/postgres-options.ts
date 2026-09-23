/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Migrator } from '@mikro-orm/migrations';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { resolveLibsqlTenants } from './libsql-options';
import { PERSISTENCE_ENTITIES } from './persistence-entities';
import { normalizeSchemaName } from './tenant-options';

export { DEFAULT_TENANT_SCHEMA, normalizeSchemaName } from './tenant-options';

/** Returns the tenant schemas this process is configured to serve. */
export function resolveAllowedTenantSchemas(): Set<string> {
  if (process.env.DB_ENGINE !== 'postgres') {
    return new Set(resolveLibsqlTenants());
  }

  const configured = process.env.TENANT_SCHEMAS;
  const values = (configured?.split(',') ?? [process.env.DB_DEFAULT_SCHEMA])
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  return new Set(
    (values.length > 0 ? values : [undefined]).map((value) =>
      normalizeSchemaName(value),
    ),
  );
}

export function createPostgresOrmOptions(schema?: string) {
  const dbName = process.env.DATABASE_NAME ?? 'nestjs_pipeline';
  const user = process.env.DATABASE_USER ?? 'postgres';
  const password = process.env.DATABASE_PASSWORD ?? 'postgres';
  const host = process.env.DATABASE_HOST ?? '127.0.0.1';
  const port = Number(process.env.DATABASE_PORT ?? 5432);

  return {
    driver: PostgreSqlDriver,
    host,
    port,
    dbName,
    user,
    password,
    schema: normalizeSchemaName(schema),
    entities: [...PERSISTENCE_ENTITIES],
    extensions: [Migrator],
    migrations: {
      schema: normalizeSchemaName(schema),
      path: 'dist/persistence/migrations',
      pathTs: 'src/persistence/migrations',
      glob: '!(*.d).{js,ts}',
    },
    debug: process.env.NODE_ENV !== 'production',
  };
}
