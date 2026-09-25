/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { currentTenantId } from '@cqrs-ddd/core/application';
import { MissingTenantContextError } from '@cqrs-ddd/core/domain';
import { filterCacheKey } from '@cqrs-ddd/core/persistence';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { TenantScopeBehavior } from './tenant-scope.behavior';

const contextFor = (tenantId: string | undefined) =>
  ({ tenantId }) as unknown as IPipelineContext;

describe('TenantScopeBehavior', () => {
  const behavior = new TenantScopeBehavior();

  it('runs the rest of the pipeline with the pipeline tenant as the @cqrs-ddd/core tenant', async () => {
    const result = await behavior.handle(contextFor('tenant_a'), async () => ({
      tenant: currentTenantId(),
      key: filterCacheKey('user', { id: '1' }),
    }));

    expect(result).toEqual({
      tenant: 'tenant_a',
      key: expect.stringMatching(/^tenant_a:user:v1:[0-9a-f]{64}$/),
    });
    expect(currentTenantId()).toBeUndefined();
  });

  it('returns the handler result and propagates its error unchanged', async () => {
    const failure = new Error('handler failed');

    await expect(
      behavior.handle(contextFor('tenant_a'), async () => 'done'),
    ).resolves.toBe('done');
    await expect(
      behavior.handle(contextFor('tenant_a'), async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });

  it('leaves cache keys failing closed for a pipeline without a tenant', async () => {
    await expect(
      behavior.handle(contextFor(undefined), async () =>
        filterCacheKey('user', { id: '1' }),
      ),
    ).rejects.toThrow(MissingTenantContextError);
  });
});
