/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { LibSqlDriver } from '@mikro-orm/libsql';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Migration20260830000000 } from './migrations/Migration20260830000000';
import {
  createLibsqlOrmOptions,
  createPostgresOrmOptions,
  libsqlDbUrl,
} from './orm-options';
import { persistenceConfig } from './persistence.config';

afterEach(() => vi.unstubAllEnvs());

function libsqlEnv(env: {
  url?: string;
  tenants?: string;
  template?: string;
}): void {
  vi.stubEnv('DB_ENGINE', 'libsql');
  vi.stubEnv('DB_DEFAULT_SCHEMA', 'tenant');
  vi.stubEnv('DATABASE_URL', env.url);
  vi.stubEnv('SQLITE_TENANTS', env.tenants);
  vi.stubEnv('SQLITE_DATABASE_TEMPLATE', env.template);
}

describe('libsqlDbUrl', () => {
  it('uses DATABASE_URL unchanged for the single default tenant', () => {
    libsqlEnv({ url: 'file:src/persistence/local.db' });

    expect(libsqlDbUrl('tenant', persistenceConfig())).toBe(
      'file:src/persistence/local.db',
    );
  });

  it('uses the local file when DATABASE_URL is unset', () => {
    libsqlEnv({});

    expect(libsqlDbUrl('tenant', persistenceConfig())).toBe(
      'file:src/persistence/local.db',
    );
  });

  it('suffixes filenames for multiple local tenants', () => {
    libsqlEnv({
      url: 'file:src/persistence/local.db',
      tenants: 'tenant_a,tenant_b',
    });

    expect(libsqlDbUrl('tenant_a', persistenceConfig())).toBe(
      'file:src/persistence/local-tenant_a.db',
    );
  });

  it('appends the tenant to a local file name without an extension', () => {
    libsqlEnv({ url: 'file:data/local', tenants: 'tenant_a' });

    expect(libsqlDbUrl('tenant_a', persistenceConfig())).toBe(
      'file:data/local-tenant_a',
    );
  });

  it('uses an explicit template for remote tenant databases', () => {
    libsqlEnv({
      url: 'libsql://primary.turso.io',
      tenants: 'tenant_a,tenant_b',
      template: 'libsql://my-{tenant}.turso.io',
    });

    expect(libsqlDbUrl('tenant_b', persistenceConfig())).toBe(
      'libsql://my-tenant_b.turso.io',
    );
  });

  it('rejects a template without {tenant}', () => {
    libsqlEnv({ template: 'libsql://fixed.turso.io' });

    expect(() => libsqlDbUrl('tenant', persistenceConfig())).toThrow(
      'SQLITE_DATABASE_TEMPLATE must contain {tenant}.',
    );
  });

  it('uses a remote DATABASE_URL unchanged for one tenant', () => {
    libsqlEnv({ url: 'libsql://mydb.turso.io' });

    expect(libsqlDbUrl('tenant', persistenceConfig())).toBe(
      'libsql://mydb.turso.io',
    );
  });

  it('rejects multiple remote tenants without a template', () => {
    libsqlEnv({ url: 'libsql://mydb.turso.io', tenants: 'tenant_a' });

    expect(() => libsqlDbUrl('tenant', persistenceConfig())).toThrow(
      /require SQLITE_DATABASE_TEMPLATE/,
    );
  });
});

describe('ORM options', () => {
  it('gives both engines the same entities and migrations', () => {
    const libsql = createLibsqlOrmOptions(':memory:');
    const postgres = createPostgresOrmOptions('tenant_a');

    expect(postgres.entities).toEqual(libsql.entities);
    expect(postgres.extensions).toEqual(libsql.extensions);
    const { migrationsList: libsqlList, ...libsqlMigrations } =
      libsql.migrations;
    const { migrationsList: postgresList, ...postgresMigrations } =
      postgres.migrations;
    expect(postgresMigrations).toEqual({
      ...libsqlMigrations,
      schema: 'tenant_a',
    });
    expect(postgresList.map(({ name }) => name)).toEqual(
      libsqlList.map(({ name }) => name),
    );
  });

  it('seeds the migrations for the tenant the options serve', async () => {
    const seed = async (migrations: {
      migrationsList: { class: typeof Migration20260830000000 }[];
    }) => {
      const [{ class: seeded }] = migrations.migrationsList;
      const migration = new seeded(undefined as never, undefined as never);
      await migration.up();
      return migration.getQueries().map(String).join('\n');
    };

    expect(
      await seed(createLibsqlOrmOptions(':memory:', 'tenant_b').migrations),
    ).toContain('vince+tenant-b@seed.local');
    expect(
      await seed(createPostgresOrmOptions('tenant_a').migrations),
    ).toContain('vince+tenant-a@seed.local');
    expect(await seed(createLibsqlOrmOptions(':memory:').migrations)).toContain(
      'vince+tenant@seed.local',
    );
  });

  it('builds libSQL options for the given database and auth token', () => {
    vi.stubEnv('AUTH_TOKEN', 'token-value');

    expect(createLibsqlOrmOptions(':memory:')).toMatchObject({
      driver: LibSqlDriver,
      dbName: ':memory:',
      password: 'token-value',
    });
  });

  it('binds PostgreSQL options to the given tenant schema', () => {
    vi.stubEnv('DATABASE_HOST', 'db.internal');
    vi.stubEnv('DATABASE_PORT', '6543');

    expect(createPostgresOrmOptions(' tenant_a ')).toMatchObject({
      driver: PostgreSqlDriver,
      host: 'db.internal',
      port: 6543,
      schema: 'tenant_a',
    });
  });

  it('binds PostgreSQL options to the default schema when none is given', () => {
    vi.stubEnv('DB_DEFAULT_SCHEMA', 'tenant_main');

    expect(createPostgresOrmOptions().schema).toBe('tenant_main');
  });

  it('rejects an invalid PostgreSQL schema', () => {
    expect(() => createPostgresOrmOptions('tenant-a')).toThrow(
      'Invalid schema name: tenant-a',
    );
  });

  it('logs queries outside production only', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(createLibsqlOrmOptions(':memory:').debug).toBe(false);

    vi.stubEnv('NODE_ENV', 'development');
    expect(createLibsqlOrmOptions(':memory:').debug).toBe(true);
  });
});
