/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type MikroORM,
  NotNullConstraintViolationException,
  UnderscoreNamingStrategy,
  UniqueConstraintViolationException,
} from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { MikroOrmDialect } from './mikro-orm.dialect.js';

class User {}
class Membership {}
class Unmapped {}

type Meta = {
  className: string;
  tableName?: string;
  properties: Record<
    string,
    { name: string; fieldNames: string[]; unique?: boolean | string }
  >;
  uniques: { properties?: string | string[]; name?: string }[];
};

const property = (
  name: string,
  unique?: boolean | string,
  fieldName = name,
) => ({ name, fieldNames: [fieldName], unique });

const users: Meta = {
  className: 'User',
  tableName: 'users',
  properties: {
    email: property('email', true),
    username: property('username', 'users_username_key', 'user_name'),
    name: property('name'),
  },
  uniques: [{ properties: 'name', name: 'users_display_name_unique' }],
};

const memberships: Meta = {
  className: 'Membership',
  tableName: 'memberships',
  properties: {
    userId: property('userId', false, 'user_id'),
    roleId: property('roleId', false, 'role_id'),
  },
  uniques: [
    { properties: ['userId', 'roleId'], name: 'memberships_pair' },
    { name: 'memberships_lower_code' },
  ],
};

function dialectFor(entries: [unknown, Meta][]) {
  const metadata = new Map(entries);
  const orm = {
    getMetadata: () => ({
      getAll: () => metadata,
      find: (cls: unknown) => metadata.get(cls),
    }),
    config: { getNamingStrategy: () => new UnderscoreNamingStrategy() },
  } as unknown as Pick<MikroORM, 'getMetadata' | 'config'>;
  return new MikroOrmDialect(orm);
}

const postgres = (constraint: string) =>
  new UniqueConstraintViolationException(
    Object.assign(new Error(`duplicate key violates "${constraint}"`), {
      constraint,
    }),
  );
const sqlite = (columns: string) =>
  new UniqueConstraintViolationException(
    new Error(`SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: ${columns}`),
  );

describe('MikroOrmDialect', () => {
  const dialect = dialectFor([
    [User, users],
    [Membership, memberships],
    [Symbol('embeddable'), { className: 'Point', properties: {}, uniques: [] }],
  ]);

  it.each([
    ['a derived name', 'users_email_unique', 'email'],
    ['a name declared on the property', 'users_username_key', 'username'],
    ['a name declared in uniques', 'users_display_name_unique', 'name'],
  ])(
    'maps a PostgreSQL violation of %s to the property',
    (_case, name, key) => {
      expect(dialect.uniqueViolation(postgres(name), new User())).toBe(key);
    },
  );

  it.each([
    ['users.email', 'email'],
    ['users.user_name', 'username'],
  ])('maps a SQLite violation of %s to the property', (columns, key) => {
    expect(dialect.uniqueViolation(sqlite(columns), new User())).toBe(key);
  });

  it('keys a multi-column constraint by its declared name', () => {
    const membership = new Membership();

    expect(
      dialect.uniqueViolation(postgres('memberships_pair'), membership),
    ).toBe('memberships_pair');
    expect(
      dialect.uniqueViolation(
        sqlite('memberships.user_id, memberships.role_id'),
        membership,
      ),
    ).toBe('memberships_pair');
    expect(
      dialect.uniqueViolation(postgres('memberships_lower_code'), membership),
    ).toBe('memberships_lower_code');
  });

  it.each([
    [
      'another error class',
      new NotNullConstraintViolationException(new Error('x')),
    ],
    ['a plain error', new Error('UNIQUE constraint failed: users.email')],
    ['an unknown constraint', postgres('users_other_unique')],
    ['unknown columns', sqlite('users.other')],
    [
      'an unparseable message',
      new UniqueConstraintViolationException(new Error('boom')),
    ],
  ])('returns undefined for %s', (_case, error) => {
    expect(dialect.uniqueViolation(error, new User())).toBeUndefined();
  });

  it('returns undefined for an entity without metadata', () => {
    expect(
      dialect.uniqueViolation(postgres('users_email_unique'), new Unmapped()),
    ).toBeUndefined();
  });

  it('refuses a multi-property unique constraint without a name', () => {
    expect(() =>
      dialectFor([
        [
          Membership,
          { ...memberships, uniques: [{ properties: ['userId', 'roleId'] }] },
        ],
      ]),
    ).toThrow(
      'Membership: a unique constraint over several properties needs a name',
    );
  });

  it('refuses two unique constraints over the same columns', () => {
    expect(() =>
      dialectFor([
        [
          User,
          {
            ...users,
            uniques: [{ properties: 'email', name: 'users_email_again' }],
          },
        ],
      ]),
    ).toThrow(
      'User: unique constraints users_email_unique and users_email_again cover the same columns',
    );
  });
});
