/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it } from 'vitest';
import { defaultCacheKey } from './cache-key';

function context(request: unknown): IPipelineContext {
  return {
    correlationId: 'request-a',
    originalCorrelationId: 'request-a',
    request,
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

describe('defaultCacheKey', () => {
  it('does not expose request payload values in the backend key', () => {
    const key = defaultCacheKey(
      context({ email: 'private@example.com', search: 'sensitive query' }),
    );

    expect(key).toMatch(
      /^cache:v2:tenant-a:request-a:GetUserQuery:[a-f0-9]{64}$/,
    );
    expect(key).not.toContain('private@example.com');
    expect(key).not.toContain('sensitive query');
  });

  it('remains deterministic for structurally equivalent requests', () => {
    expect(defaultCacheKey(context({ a: 1, b: 2 }))).toBe(
      defaultCacheKey(context({ b: 2, a: 1 })),
    );
  });

  it('changes when the request payload changes', () => {
    expect(defaultCacheKey(context({ id: 1 }))).not.toBe(
      defaultCacheKey(context({ id: 2 })),
    );
  });
});
