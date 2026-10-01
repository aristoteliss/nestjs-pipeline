/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  defaultSchema,
  persistenceConfig,
  tenantSchema,
} from './persistence.config.js';
import { InvalidTenantSchemaError } from './tenant-schema.errors.js';

beforeEach(() => {
  vi.stubEnv('DB_ENGINE', undefined);
  vi.stubEnv('DB_DEFAULT_SCHEMA', undefined);
  vi.stubEnv('TENANT_SCHEMAS', undefined);
  vi.stubEnv('SQLITE_TENANTS', undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('tenantSchema', () => {
  it('trims a valid name', () => {
    expect(tenantSchema(' tenant_a ')).toBe('tenant_a');
  });

  it.each(['', '   ', 'tenant-a', '1tenant', 'a,b', 'tenant a'])(
    'rejects %j',
    (value) => {
      expect(() => tenantSchema(value)).toThrow(InvalidTenantSchemaError);
    },
  );
});

describe('defaultSchema', () => {
  it('is "tenant" when DB_DEFAULT_SCHEMA is unset or blank', () => {
    expect(defaultSchema()).toBe('tenant');

    vi.stubEnv('DB_DEFAULT_SCHEMA', '  ');
    expect(defaultSchema()).toBe('tenant');
  });

  it('reads DB_DEFAULT_SCHEMA', () => {
    vi.stubEnv('DB_DEFAULT_SCHEMA', ' tenant_main ');

    expect(defaultSchema()).toBe('tenant_main');
  });

  it('rejects a list, because it names exactly one schema', () => {
    vi.stubEnv('DB_DEFAULT_SCHEMA', 'a,b');

    expect(() => defaultSchema()).toThrow(InvalidTenantSchemaError);
  });
});

describe('persistenceConfig', () => {
  describe('engine', () => {
    it('defaults to libsql', () => {
      expect(persistenceConfig().engine).toBe('libsql');
    });

    it.each([
      ['postgres', 'postgres'],
      ['Postgres', 'postgres'],
      [' POSTGRES ', 'postgres'],
      ['libsql', 'libsql'],
      ['LibSQL', 'libsql'],
      ['', 'libsql'],
    ])('reads DB_ENGINE=%j as %s', (value, expected) => {
      vi.stubEnv('DB_ENGINE', value);

      expect(persistenceConfig().engine).toBe(expected);
    });

    it('rejects an unknown engine instead of falling back to libsql', () => {
      vi.stubEnv('DB_ENGINE', 'sqlite');

      expect(() => persistenceConfig()).toThrow(
        'DB_ENGINE must be "libsql" or "postgres", received "sqlite".',
      );
    });
  });

  describe('PostgreSQL tenants', () => {
    beforeEach(() => vi.stubEnv('DB_ENGINE', 'postgres'));

    it('serves TENANT_SCHEMAS, trimmed and deduplicated', () => {
      vi.stubEnv('TENANT_SCHEMAS', ' tenant_a ,tenant_b,tenant_a');

      expect(persistenceConfig().tenants).toEqual(['tenant_a', 'tenant_b']);
    });

    it('drops blank entries instead of serving the default schema', () => {
      vi.stubEnv('TENANT_SCHEMAS', 'tenant_a, ,tenant_b,');

      expect(persistenceConfig().tenants).toEqual(['tenant_a', 'tenant_b']);
    });

    it('does not add the default schema to a configured list', () => {
      vi.stubEnv('DB_DEFAULT_SCHEMA', 'tenant_main');
      vi.stubEnv('TENANT_SCHEMAS', 'tenant_a');

      expect(persistenceConfig().tenants).toEqual(['tenant_a']);
    });

    it.each([undefined, '', ' , '])(
      'serves the default schema alone when TENANT_SCHEMAS is %j',
      (value) => {
        vi.stubEnv('DB_DEFAULT_SCHEMA', 'tenant_main');
        vi.stubEnv('TENANT_SCHEMAS', value);

        expect(persistenceConfig().tenants).toEqual(['tenant_main']);
      },
    );

    it('rejects an invalid tenant instead of replacing it', () => {
      vi.stubEnv('TENANT_SCHEMAS', 'tenant_a,tenant-b');

      expect(() => persistenceConfig()).toThrow(
        'Invalid schema name: tenant-b',
      );
    });

    it('rejects a default-schema list even without TENANT_SCHEMAS', () => {
      vi.stubEnv('DB_DEFAULT_SCHEMA', 'a,b');

      expect(() => persistenceConfig()).toThrow(InvalidTenantSchemaError);
    });
  });

  describe('libSQL tenants', () => {
    it('serves the default schema plus SQLITE_TENANTS, deduplicated', () => {
      vi.stubEnv('DB_DEFAULT_SCHEMA', ' tenant ');
      vi.stubEnv('SQLITE_TENANTS', ' tenant_a ,tenant, ,tenant_a');

      expect(persistenceConfig().tenants).toEqual(['tenant', 'tenant_a']);
    });

    it('serves the default schema alone without SQLITE_TENANTS', () => {
      expect(persistenceConfig().tenants).toEqual(['tenant']);
    });

    it('rejects an invalid tenant', () => {
      vi.stubEnv('SQLITE_TENANTS', 'tenant-a');

      expect(() => persistenceConfig()).toThrow('Invalid schema name');
    });
  });

  describe('connection settings', () => {
    it('reads the PostgreSQL connection, with local defaults', () => {
      vi.stubEnv('DATABASE_HOST', undefined);
      vi.stubEnv('DATABASE_PORT', undefined);
      vi.stubEnv('DATABASE_NAME', undefined);
      vi.stubEnv('DATABASE_USER', undefined);
      vi.stubEnv('DATABASE_PASSWORD', undefined);

      expect(persistenceConfig().postgres).toEqual({
        host: '127.0.0.1',
        port: 5432,
        dbName: 'nestjs_pipeline',
        user: 'postgres',
        password: 'postgres',
      });
    });

    it.each(['0', '-1', '54.3', 'port'])(
      'rejects DATABASE_PORT=%j',
      (value) => {
        vi.stubEnv('DATABASE_PORT', value);

        expect(() => persistenceConfig()).toThrow(
          `DATABASE_PORT must be a positive integer, received "${value}".`,
        );
      },
    );
  });
});
