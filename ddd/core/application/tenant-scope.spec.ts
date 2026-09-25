/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { MissingTenantContextError } from '../domain/exceptions/missing-tenant-context.exception';
import {
  currentTenantId,
  requireTenantId,
  runWithTenant,
} from './tenant-scope';

describe('tenant scope', () => {
  it('has no tenant outside any scope', () => {
    expect(currentTenantId()).toBeUndefined();
  });

  it('exposes the tenant inside a scope and returns the callback result', () => {
    const result = runWithTenant('tenant_a', () => currentTenantId());
    expect(result).toBe('tenant_a');
    expect(currentTenantId()).toBeUndefined();
  });

  it('keeps the tenant across awaits and in concurrent scopes', async () => {
    const read = (tenant: string, delay: number) =>
      runWithTenant(tenant, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return currentTenantId();
      });

    await expect(
      Promise.all([read('tenant_a', 10), read('tenant_b', 1)]),
    ).resolves.toEqual(['tenant_a', 'tenant_b']);
  });

  it('lets a nested scope replace the tenant for its callback only', () => {
    runWithTenant('outer', () => {
      expect(runWithTenant('inner', () => currentTenantId())).toBe('inner');
      expect(currentTenantId()).toBe('outer');
    });
  });

  it('runs with no tenant when given undefined', () => {
    runWithTenant('outer', () => {
      expect(runWithTenant(undefined, () => currentTenantId())).toBeUndefined();
    });
  });
});

describe('requireTenantId', () => {
  it('returns an explicit tenant string, even inside another scope', () => {
    expect(requireTenantId('tenant_a', 'key')).toBe('tenant_a');
    expect(
      runWithTenant('scoped', () => requireTenantId('tenant_a', 'key')),
    ).toBe('tenant_a');
  });

  it("uses an object's tenantId before the scope", () => {
    expect(
      runWithTenant('scoped', () =>
        requireTenantId({ tenantId: 'ctx' }, 'key'),
      ),
    ).toBe('ctx');
  });

  it('falls back to the scope without a source, or for an object without tenantId', () => {
    runWithTenant('scoped', () => {
      expect(requireTenantId(undefined, 'key')).toBe('scoped');
      expect(requireTenantId({}, 'key')).toBe('scoped');
    });
  });

  it.each([
    [
      'no source and no scope',
      () => requireTenantId(undefined, 'idempotency key'),
    ],
    [
      'an object without tenantId and no scope',
      () => requireTenantId({}, 'idempotency key'),
    ],
    [
      'an empty string, even inside a scope',
      () =>
        runWithTenant('scoped', () => requireTenantId('', 'idempotency key')),
    ],
    [
      'an empty tenantId, even inside a scope',
      () =>
        runWithTenant('scoped', () =>
          requireTenantId({ tenantId: '' }, 'idempotency key'),
        ),
    ],
  ])('fails closed for %s', (_label, resolve) => {
    expect(resolve).toThrow(MissingTenantContextError);
    expect(resolve).toThrow('idempotency key');
  });
});
