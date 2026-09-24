/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { currentTenantId, runWithTenant } from './tenant-scope';

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
