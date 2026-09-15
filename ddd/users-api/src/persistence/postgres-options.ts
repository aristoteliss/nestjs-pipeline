/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Migrator } from '@mikro-orm/migrations';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { resolveLibsqlTenants } from './libsql-options';
import { AuthSchema } from './schemas/auth.schema';
import { CacheSchema } from './schemas/cache.schema';
import { CapabilitySchema } from './schemas/capability.schema';
import { RoleSchema } from './schemas/role.schema';
import { RoleCapabilitySchema } from './schemas/role-capability.schema';
import { UserSchema } from './schemas/user.schema';
import { UserAdditionalCapabilitySchema } from './schemas/user-additional-capability.schema';
import { UserDeniedCapabilitySchema } from './schemas/user-denied-capability.schema';
import { UserRoleSchema } from './schemas/user-role.schema';
import { normalizeSchemaName } from './tenant-options';

export { DEFAULT_TENANT_SCHEMA, normalizeSchemaName } from './tenant-options';

/** Returns the tenant schemas this process is configured to serve. */
export function resolveAllowedTenantSchemas(): Set<string> {
  if (process.env.DB_ENGINE !== 'postgres') {
    return new Set(resolveLibsqlTenants().map(normalizeSchemaName));
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
    entities: [
      UserSchema,
      AuthSchema,
      RoleSchema,
      CapabilitySchema,
      RoleCapabilitySchema,
      UserRoleSchema,
      UserAdditionalCapabilitySchema,
      UserDeniedCapabilitySchema,
      CacheSchema,
    ],
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
