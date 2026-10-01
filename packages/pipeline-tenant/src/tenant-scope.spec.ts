/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  currentTenantId,
  runWithTenant,
  tenantSource,
} from './tenant-scope.js';

describe('runWithTenant and currentTenantId', () => {
  it('has no tenant outside any scope', () => {
    expect(currentTenantId()).toBeUndefined();
  });

  it('exposes the tenant inside a scope and returns the callback result', () => {
    expect(runWithTenant('tenant_a', () => currentTenantId())).toBe('tenant_a');
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
      expect(runWithTenant(undefined, () => currentTenantId())).toBeUndefined();
      expect(currentTenantId()).toBe('outer');
    });
  });

  it('reads and sets the same tenant through tenantSource', () => {
    expect(tenantSource.run('tenant_a', () => currentTenantId())).toBe(
      'tenant_a',
    );
    expect(runWithTenant('tenant_b', () => tenantSource.current())).toBe(
      'tenant_b',
    );
  });
});
