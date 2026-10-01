/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { Auth } from '../src/auths/domain/models/auth.entity.js';
import { generateSchemaSql } from '../src/persistence/schema-ddl.js';
import { Role } from '../src/roles/domain/models/role.entity.js';
import { User } from '../src/users/domain/models/user.entity.js';
import {
  postgresUniqueViolation,
  sqliteUniqueViolation,
  useSchemaDialect,
} from './support/schema-dialect.js';

/**
 * Every unique constraint the schemas declare, with the property a repository
 * maps it by. The dialect must resolve each one from both engines' errors, and
 * the migration must create each index under the name PostgreSQL will report.
 */
const UNIQUES = [
  {
    entity: () => User.create('alice', 'alice@example.test'),
    name: 'users_email_unique',
    columns: 'users.email',
    key: 'email',
  },
  {
    entity: () => Role.create('editor'),
    name: 'roles_name_unique',
    columns: 'roles.name',
    key: 'name',
  },
  {
    entity: () => Auth.create('019488e0-0000-7000-8000-000000000001', 'h', 1),
    name: 'auth_refresh_token_hash_unique',
    columns: 'auth.refresh_token_hash',
    key: 'refreshTokenHash',
  },
];

describe('schema unique constraints', () => {
  const dialect = useSchemaDialect();

  it.each(UNIQUES)(
    'maps $name to $key from PostgreSQL and SQLite errors',
    ({ entity, name, columns, key }) => {
      expect(
        dialect.uniqueViolation(postgresUniqueViolation(name), entity()),
      ).toBe(key);
      expect(
        dialect.uniqueViolation(sqliteUniqueViolation(columns), entity()),
      ).toBe(key);
    },
  );

  it.each(UNIQUES)('creates $name as a unique index', ({ name, columns }) => {
    const [table, column] = columns.split('.');

    expect(generateSchemaSql()).toContain(
      `create unique index ${name} on ${table} (${column});`,
    );
  });
});
