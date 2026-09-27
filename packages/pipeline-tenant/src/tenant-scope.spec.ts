/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { currentScope, runInScope } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { currentTenantId, runWithTenant } from './tenant-scope';

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

  it('shares the core execution scope and keeps its correlation id', () => {
    runInScope({ tenantId: 'tenant_a', correlationId: 'corr-1' }, () => {
      expect(currentTenantId()).toBe('tenant_a');
      runWithTenant('tenant_b', () =>
        expect(currentScope()).toEqual({
          tenantId: 'tenant_b',
          correlationId: 'corr-1',
        }),
      );
    });
  });
});
