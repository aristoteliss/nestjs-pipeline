import type { IPipelineContext } from '@nestjs-pipeline/core';
import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { describe, expect, it, vi } from 'vitest';
import { CacheBehavior } from './cache.behavior';

function context(correlationId: string): IPipelineContext {
  return {
    correlationId,
    originalCorrelationId: correlationId,
    request: { id: 1 },
    requestType: class GetUserQuery {},
    requestName: 'GetUserQuery',
    handlerType: class GetUserHandler {},
    handlerName: 'GetUserHandler',
    requestKind: 'query',
    tenantId: 'tenant-a',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: () => undefined,
  } as unknown as IPipelineContext;
}

describe('CacheBehavior secure default key', () => {
  it('does not replay a default-cached response into a different request scope', async () => {
    const behavior = new CacheBehavior(
      createCache({ stores: [new Keyv()] }),
    );
    const next = vi
      .fn()
      .mockResolvedValueOnce({ visibleTo: 'request-a' })
      .mockResolvedValueOnce({ visibleTo: 'request-b' });

    const first = await behavior.handle(context('request-a'), next);
    const second = await behavior.handle(context('request-b'), next);

    expect(first).toEqual({ visibleTo: 'request-a' });
    expect(second).toEqual({ visibleTo: 'request-b' });
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('still reuses the default cache inside the same request scope', async () => {
    const behavior = new CacheBehavior(
      createCache({ stores: [new Keyv()] }),
    );
    const next = vi.fn().mockResolvedValue({ value: 'same-request' });

    await behavior.handle(context('request-a'), next);
    await behavior.handle(context('request-a'), next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
