/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { currentTenantId, runWithTenant } from './tenant-scope';

const inPipeline = <T>(tenantId: string | undefined, fn: () => T): T =>
  pipelineStore.run({ tenantId } as unknown as IPipelineContext, fn);

describe('runWithTenant and currentTenantId', () => {
  it('has no tenant outside any scope or pipeline', () => {
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

  it("uses the running pipeline's tenant", () => {
    expect(inPipeline('tenant_p', () => currentTenantId())).toBe('tenant_p');
    expect(inPipeline(undefined, () => currentTenantId())).toBeUndefined();
  });

  it('lets a scope entered inside a pipeline replace its tenant', () => {
    inPipeline('tenant_p', () => {
      expect(runWithTenant('tenant_s', () => currentTenantId())).toBe(
        'tenant_s',
      );
      expect(runWithTenant(undefined, () => currentTenantId())).toBeUndefined();
    });
  });

  it('runs a pipeline dispatched inside a scope with its own tenant', () => {
    runWithTenant('tenant_s', () => {
      expect(inPipeline('tenant_p', () => currentTenantId())).toBe('tenant_p');
      expect(inPipeline(undefined, () => currentTenantId())).toBeUndefined();
    });
  });

  it('runs a nested pipeline with its own tenant, not the scope of its parent', () => {
    inPipeline('parent', () =>
      runWithTenant('tenant_s', () => {
        expect(inPipeline('child', () => currentTenantId())).toBe('child');
      }),
    );
  });

  it('applies a scope when no pipeline is running, wherever it was entered', () => {
    inPipeline('tenant_p', () =>
      runWithTenant('tenant_s', () => {
        expect(pipelineStore.exit(() => currentTenantId())).toBe('tenant_s');
      }),
    );
  });
});
