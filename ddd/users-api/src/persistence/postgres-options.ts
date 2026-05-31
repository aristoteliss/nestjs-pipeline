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

import { Migrator } from '@mikro-orm/migrations';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { BadRequestException } from '@nestjs/common';
import { AuthSchema } from './schemas/auth.schema';
import { CacheSchema } from './schemas/cache.schema';
import { CapabilitySchema } from './schemas/capability.schema';
import { RoleSchema } from './schemas/role.schema';
import { RoleCapabilitySchema } from './schemas/role-capability.schema';
import { UserSchema } from './schemas/user.schema';
import { UserAdditionalCapabilitySchema } from './schemas/user-additional-capability.schema';
import { UserDeniedCapabilitySchema } from './schemas/user-denied-capability.schema';
import { UserRoleSchema } from './schemas/user-role.schema';

export const DEFAULT_TENANT_SCHEMA = 'tenant';
const SCHEMA_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Returns a valid PostgreSQL schema name for tenant routing.
 */
export function normalizeSchemaName(value?: string | null): string {
  const candidate = (value ?? '').trim();
  if (!candidate) {
    return process.env.DB_DEFAULT_SCHEMA ?? DEFAULT_TENANT_SCHEMA;
  }

  if (!SCHEMA_NAME_REGEX.test(candidate)) {
    throw new BadRequestException(`Invalid schema name: ${candidate}`);
  }

  return candidate;
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
      path: 'dist/persistence/migrations',
      pathTs: 'src/persistence/migrations',
      glob: '!(*.d).{js,ts}',
    },
    debug: process.env.NODE_ENV !== 'production',
  };
}
