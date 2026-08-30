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

import { afterEach, describe, expect, it } from 'vitest';
import { resolveLibsqlDbUrl, resolveLibsqlTenants } from './libsql-options';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('libSQL tenant resolution', () => {
  it('uses DATABASE_URL unchanged for the single default tenant', () => {
    process.env.DATABASE_URL = 'file:src/persistence/local.db';
    process.env.DB_DEFAULT_SCHEMA = 'tenant';
    delete process.env.SQLITE_TENANTS;
    delete process.env.SQLITE_DATABASE_TEMPLATE;

    expect(resolveLibsqlTenants()).toEqual(['tenant']);
    expect(resolveLibsqlDbUrl('tenant')).toBe('file:src/persistence/local.db');
  });

  it('suffixes filenames for multiple local tenants', () => {
    process.env.DATABASE_URL = 'file:src/persistence/local.db';
    process.env.DB_DEFAULT_SCHEMA = 'tenant';
    process.env.SQLITE_TENANTS = 'tenant_a,tenant_b';
    delete process.env.SQLITE_DATABASE_TEMPLATE;

    expect(resolveLibsqlDbUrl('tenant_a')).toBe(
      'file:src/persistence/local-tenant_a.db',
    );
  });

  it('uses an explicit template for remote tenant databases', () => {
    process.env.DATABASE_URL = 'libsql://primary.turso.io';
    process.env.DB_DEFAULT_SCHEMA = 'tenant';
    process.env.SQLITE_TENANTS = 'tenant_a,tenant_b';
    process.env.SQLITE_DATABASE_TEMPLATE = 'libsql://my-{tenant}.turso.io';

    expect(resolveLibsqlDbUrl('tenant_b')).toBe(
      'libsql://my-tenant_b.turso.io',
    );
  });

  it('uses a remote DATABASE_URL unchanged for one tenant', () => {
    process.env.DATABASE_URL = 'libsql://mydb.turso.io';
    process.env.DB_DEFAULT_SCHEMA = 'tenant';
    delete process.env.SQLITE_TENANTS;
    delete process.env.SQLITE_DATABASE_TEMPLATE;

    expect(resolveLibsqlDbUrl('tenant')).toBe('libsql://mydb.turso.io');
  });

  it('rejects multiple remote tenants without a template', () => {
    process.env.DATABASE_URL = 'libsql://mydb.turso.io';
    process.env.DB_DEFAULT_SCHEMA = 'tenant';
    process.env.SQLITE_TENANTS = 'tenant_a';
    delete process.env.SQLITE_DATABASE_TEMPLATE;

    expect(() => resolveLibsqlDbUrl('tenant')).toThrow(
      /require SQLITE_DATABASE_TEMPLATE/,
    );
  });
});
