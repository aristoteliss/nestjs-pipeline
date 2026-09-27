/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { TenantSchemaContext } from '../tenant-schema.context';
import { TenantSchemaMiddleware } from './tenant-schema.middleware';

function middleware(
  tenants: string[],
  context = new TenantSchemaContext(),
): TenantSchemaMiddleware {
  return new TenantSchemaMiddleware(context, new Set(tenants));
}

describe('TenantSchemaMiddleware', () => {
  it('runs the request inside a configured tenant', () => {
    const context = new TenantSchemaContext();
    const next = vi.fn(() => {
      expect(context.schema).toBe('tenant_b');
    });

    middleware(['tenant_a', 'tenant_b'], context).use(
      { headers: { 'x-tenant-schema': ' tenant_b ' } },
      undefined,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it('reads the first value of a repeated header', () => {
    const next = vi.fn();

    middleware(['tenant_a']).use(
      { headers: { 'x-tenant-schema': ['tenant_a', 'tenant_b'] } },
      undefined,
      next,
    );

    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects a syntactically valid but unconfigured schema', () => {
    expect(() =>
      middleware(['tenant_a']).use(
        { headers: { 'x-tenant-schema': 'tenant_b' } },
        undefined,
        vi.fn(),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a request without a tenant header', () => {
    expect(() => middleware(['tenant_a']).use({}, undefined, vi.fn())).toThrow(
      ForbiddenException,
    );
  });

  it.each(['tenant-a', '   '])(
    'answers the malformed schema header %j with a bad request',
    (value) => {
      const next = vi.fn();

      expect(() =>
        middleware(['tenant_a', 'tenant']).use(
          { headers: { 'x-tenant-schema': value } },
          undefined,
          next,
        ),
      ).toThrow(BadRequestException);
      expect(next).not.toHaveBeenCalled();
    },
  );
});
