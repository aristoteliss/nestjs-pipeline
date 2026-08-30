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

import { LibSqlDriver } from '@mikro-orm/libsql';
import { Migrator } from '@mikro-orm/migrations';
import { AuthSchema } from './schemas/auth.schema';
import { CacheSchema } from './schemas/cache.schema';
import { CapabilitySchema } from './schemas/capability.schema';
import { RoleSchema } from './schemas/role.schema';
import { RoleCapabilitySchema } from './schemas/role-capability.schema';
import { UserSchema } from './schemas/user.schema';
import { UserAdditionalCapabilitySchema } from './schemas/user-additional-capability.schema';
import { UserDeniedCapabilitySchema } from './schemas/user-denied-capability.schema';
import { UserRoleSchema } from './schemas/user-role.schema';
import { DEFAULT_TENANT_SCHEMA } from './tenant-options';

export const DEFAULT_SQLITE_DATABASE_URL = 'file:src/persistence/local.db';

/**
 * Returns the configured default tenant schema name.
 */
export function resolveDefaultSchema(): string {
  return process.env.DB_DEFAULT_SCHEMA ?? DEFAULT_TENANT_SCHEMA;
}

/**
 * Resolves the SQLite database URL for a given tenant schema.
 *
 * `SQLITE_DATABASE_TEMPLATE` (when set) must contain `{tenant}` and is used for
 * every tenant. Without a template, a single tenant uses `DATABASE_URL`
 * unchanged. Multiple local `file:` tenants get a filename suffix; multiple
 * remote tenants require an explicit template so a hostname is never mutated.
 */
export function resolveLibsqlDbUrl(schema: string): string {
  const template = process.env.SQLITE_DATABASE_TEMPLATE;
  if (template !== undefined) {
    if (!template.includes('{tenant}')) {
      throw new Error('SQLITE_DATABASE_TEMPLATE must contain {tenant}.');
    }
    return template.replaceAll('{tenant}', schema);
  }

  const base = process.env.DATABASE_URL ?? DEFAULT_SQLITE_DATABASE_URL;
  if (resolveLibsqlTenants().length === 1) return base;

  if (!base.startsWith('file:')) {
    throw new Error(
      'Multiple remote libSQL tenants require SQLITE_DATABASE_TEMPLATE with {tenant}.',
    );
  }

  const slashIndex = base.lastIndexOf('/');
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex > slashIndex) {
    return `${base.slice(0, dotIndex)}-${schema}${base.slice(dotIndex)}`;
  }

  return `${base}-${schema}`;
}

/**
 * Resolves the list of tenant schemas to initialize at startup: the default
 * schema plus any tenants listed in the `SQLITE_TENANTS` env (comma-separated).
 */
export function resolveLibsqlTenants(): string[] {
  const configured = (process.env.SQLITE_TENANTS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set([resolveDefaultSchema(), ...configured]));
}

export function createLibsqlOrmOptions(
  dbName = process.env.DATABASE_URL ?? DEFAULT_SQLITE_DATABASE_URL,
) {
  return {
    driver: LibSqlDriver,
    dbName,
    password: process.env.AUTH_TOKEN,
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
      path: 'dist/persistence/migrations',
      pathTs: 'src/persistence/migrations',
      glob: '!(*.d).{js,ts}',
    },
    debug: process.env.NODE_ENV !== 'production',
  };
}
