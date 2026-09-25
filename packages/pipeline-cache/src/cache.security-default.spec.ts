/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { describe, expect, it, vi } from 'vitest';
import { CacheBehavior } from './cache.behavior';
import { createPartitionedCacheKeyFactory } from './helpers/cache-key';
import type { CacheBehaviorOptions } from './interfaces/cache-options.interface';

const partitioned: CacheBehaviorOptions = {
  key: createPartitionedCacheKeyFactory({
    principal: (ctx) => ctx.items.get('userId') as string | undefined,
    requireScope: false,
  }),
};

function context(
  correlationId: string,
  userId: string,
  // `options` defaults to the partitioned key factory; `configured = false`
  // makes the context report no behavior options at all.
  options: CacheBehaviorOptions | undefined = partitioned,
  configured = true,
): IPipelineContext {
  return {
    correlationId,
    request: { id: 1 },
    requestType: class GetUserQuery {},
    requestName: 'GetUserQuery',
    handlerType: class GetUserHandler {},
    handlerName: 'GetUserHandler',
    requestKind: 'query',
    tenantId: 'tenant-a',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map<string | symbol, unknown>([['userId', userId]]),
    getBehaviorOptions: () => (configured ? options : undefined),
  } as unknown as IPipelineContext;
}

describe('CacheBehavior key safety', () => {
  it('refuses to run without an explicit key factory', () => {
    // A correlation ID cannot key a cache: it is unique per request, a client
    // can choose it, and nested executions inherit it.
    const behavior = new CacheBehavior(createCache({ stores: [new Keyv()] }));
    const next = vi.fn().mockResolvedValue({ value: 1 });

    return expect(
      behavior.handle(context('c-1', 'alice', undefined, false), next),
    ).rejects.toThrow(/requires an explicit `key` factory/);
  });

  it('does not replay one principal response to another sharing a correlation ID', async () => {
    // Same tenant, query, payload and correlation ID; only the principal differs.
    const behavior = new CacheBehavior(createCache({ stores: [new Keyv()] }));
    const next = vi
      .fn()
      .mockResolvedValueOnce({ visibleTo: 'alice' })
      .mockResolvedValueOnce({ visibleTo: 'bob' });

    const first = await behavior.handle(context('shared-corr', 'alice'), next);
    const second = await behavior.handle(context('shared-corr', 'bob'), next);

    expect(first).toEqual({ visibleTo: 'alice' });
    expect(second).toEqual({ visibleTo: 'bob' });
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('serves the same principal from cache across separate requests', async () => {
    const behavior = new CacheBehavior(createCache({ stores: [new Keyv()] }));
    const next = vi.fn().mockResolvedValue({ value: 'cached' });

    const first = await behavior.handle(context('request-a', 'alice'), next);
    const second = await behavior.handle(context('request-b', 'alice'), next);

    expect(first).toEqual({ value: 'cached' });
    expect(second).toEqual({ value: 'cached' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('separates tenants that share a principal identifier', async () => {
    const behavior = new CacheBehavior(createCache({ stores: [new Keyv()] }));
    const next = vi
      .fn()
      .mockResolvedValueOnce({ tenant: 'a' })
      .mockResolvedValueOnce({ tenant: 'b' });

    const inTenantA = context('c-1', 'alice');
    const inTenantB = {
      ...context('c-1', 'alice'),
      tenantId: 'tenant-b',
      items: new Map<string | symbol, unknown>([['userId', 'alice']]),
    } as unknown as IPipelineContext;

    expect(await behavior.handle(inTenantA, next)).toEqual({ tenant: 'a' });
    expect(await behavior.handle(inTenantB, next)).toEqual({ tenant: 'b' });
    expect(next).toHaveBeenCalledTimes(2);
  });
});
