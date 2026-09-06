import { ForbiddenException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TenantSchemaContext } from '../tenant-schema.context';
import { TenantSchemaMiddleware } from './tenant-schema.middleware';

const originalTenantSchemas = process.env.TENANT_SCHEMAS;
const originalDbEngine = process.env.DB_ENGINE;
const originalSqliteTenants = process.env.SQLITE_TENANTS;
const originalDefaultSchema = process.env.DB_DEFAULT_SCHEMA;

afterEach(() => {
  if (originalTenantSchemas === undefined) delete process.env.TENANT_SCHEMAS;
  else process.env.TENANT_SCHEMAS = originalTenantSchemas;
  if (originalDbEngine === undefined) delete process.env.DB_ENGINE;
  else process.env.DB_ENGINE = originalDbEngine;
  if (originalSqliteTenants === undefined) delete process.env.SQLITE_TENANTS;
  else process.env.SQLITE_TENANTS = originalSqliteTenants;
  if (originalDefaultSchema === undefined) delete process.env.DB_DEFAULT_SCHEMA;
  else process.env.DB_DEFAULT_SCHEMA = originalDefaultSchema;
});

describe('TenantSchemaMiddleware', () => {
  it('accepts only configured PostgreSQL tenant schemas', () => {
    process.env.DB_ENGINE = 'postgres';
    process.env.TENANT_SCHEMAS = 'tenant_a,tenant_b';
    const context = new TenantSchemaContext();
    const next = vi.fn(() => {
      expect(context.schema).toBe('tenant_b');
    });

    new TenantSchemaMiddleware(context).use(
      { headers: { 'x-tenant-schema': 'tenant_b' } },
      undefined,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a syntactically valid but unconfigured schema', () => {
    process.env.DB_ENGINE = 'postgres';
    process.env.TENANT_SCHEMAS = 'tenant_a';

    expect(() =>
      new TenantSchemaMiddleware(new TenantSchemaContext()).use(
        { headers: { 'x-tenant-schema': 'tenant_b' } },
        undefined,
        vi.fn(),
      ),
    ).toThrow(ForbiddenException);
  });

  it('accepts the libSQL default tenant alongside configured extra tenants', () => {
    process.env.DB_ENGINE = 'libsql';
    process.env.DB_DEFAULT_SCHEMA = 'tenant';
    process.env.SQLITE_TENANTS = 'tenant_a';
    const next = vi.fn();

    new TenantSchemaMiddleware(new TenantSchemaContext()).use(
      { headers: { 'x-tenant-schema': 'tenant' } },
      undefined,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });
});
