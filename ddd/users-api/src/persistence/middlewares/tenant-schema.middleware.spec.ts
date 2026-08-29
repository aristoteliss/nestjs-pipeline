import { ForbiddenException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TenantSchemaContext } from '../tenant-schema.context';
import { TenantSchemaMiddleware } from './tenant-schema.middleware';

const originalTenantSchemas = process.env.TENANT_SCHEMAS;
const originalDbEngine = process.env.DB_ENGINE;

afterEach(() => {
  if (originalTenantSchemas === undefined) delete process.env.TENANT_SCHEMAS;
  else process.env.TENANT_SCHEMAS = originalTenantSchemas;
  if (originalDbEngine === undefined) delete process.env.DB_ENGINE;
  else process.env.DB_ENGINE = originalDbEngine;
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
});
