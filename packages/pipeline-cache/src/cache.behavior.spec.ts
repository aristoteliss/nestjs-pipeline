/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { type Cache, createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CACHE_HIT_ITEM,
  CACHE_KEY_ITEM,
  CacheBehavior,
} from './cache.behavior';
import type { CacheBehaviorOptions } from './interfaces/cache-options.interface';

// ─── Context factory ──────────────────────────────────────────────────────────

function makeCtx(
  options?: CacheBehaviorOptions,
  overrides: Partial<IPipelineContext> = {},
): IPipelineContext {
  return {
    correlationId: 'test-corr-id',
    originalCorrelationId: 'test-corr-id',
    request: { id: 1 },
    requestType: class TestRequest {},
    requestName: 'GetUserQuery',
    handlerType: overrides.handlerType ?? class TestHandler {},
    handlerName: 'GetUserHandler',
    requestKind: 'query',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(options),
    ...overrides,
  } as unknown as IPipelineContext;
}

function makeCache(): Cache {
  return createCache({ stores: [new Keyv()] });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CacheBehavior', () => {
  let cache: Cache;
  let behavior: CacheBehavior;

  beforeEach(() => {
    cache = makeCache();
    behavior = new CacheBehavior(cache);
  });

  it('caches the result on a miss and serves it on the next hit', async () => {
    const next = vi.fn().mockResolvedValue({ name: 'Ada' });

    const first = await behavior.handle(makeCtx(), next);
    const second = await behavior.handle(makeCtx(), next);

    expect(first).toEqual({ name: 'Ada' });
    expect(second).toEqual({ name: 'Ada' });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('records hit / miss and the resolved key on the context items', async () => {
    const next = vi.fn().mockResolvedValue('value');

    const missCtx = makeCtx();
    await behavior.handle(missCtx, next);
    expect(missCtx.items.get(CACHE_HIT_ITEM)).toBe(false);
    expect(missCtx.items.get(CACHE_KEY_ITEM)).toBe('GetUserQuery:{"id":1}');

    const hitCtx = makeCtx();
    await behavior.handle(hitCtx, next);
    expect(hitCtx.items.get(CACHE_HIT_ITEM)).toBe(true);
  });

  it('uses cache-manager wrap on hits so refreshThreshold can refresh in the background', async () => {
    const next = vi.fn().mockResolvedValue('fresh');
    const wrap = vi.fn().mockResolvedValue('stale');
    const refreshableCache = {
      get: vi.fn().mockResolvedValue('stale'),
      wrap,
    } as unknown as Cache;
    const refreshableBehavior = new CacheBehavior(refreshableCache);

    const result = await refreshableBehavior.handle(
      makeCtx({ ttl: 500 }),
      next,
    );

    expect(result).toBe('stale');
    expect(wrap).toHaveBeenCalledWith('GetUserQuery:{"id":1}', next, 500);
  });

  it('passes through non-query requests by default', async () => {
    const next = vi.fn().mockResolvedValue('value');

    await behavior.handle(makeCtx(undefined, { requestKind: 'command' }), next);
    await behavior.handle(makeCtx(undefined, { requestKind: 'command' }), next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('honors a custom kinds list', async () => {
    const next = vi.fn().mockResolvedValue('value');
    const options: CacheBehaviorOptions = { kinds: ['command'] };

    await behavior.handle(makeCtx(options, { requestKind: 'command' }), next);
    await behavior.handle(makeCtx(options, { requestKind: 'command' }), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('uses a custom key factory', async () => {
    const next = vi.fn().mockResolvedValue('value');
    const options: CacheBehaviorOptions = { key: () => 'fixed-key' };

    const ctx = makeCtx(options);
    await behavior.handle(ctx, next);

    expect(ctx.items.get(CACHE_KEY_ITEM)).toBe('fixed-key');
    expect(await cache.get('fixed-key')).toBe('value');
  });

  it('skips caching when the condition returns false', async () => {
    const next = vi.fn().mockResolvedValue('value');
    const options: CacheBehaviorOptions = { condition: () => false };

    await behavior.handle(makeCtx(options), next);
    await behavior.handle(makeCtx(options), next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('does not cache null or undefined results', async () => {
    const next = vi.fn().mockResolvedValue(null);

    await behavior.handle(makeCtx(), next);
    await behavior.handle(makeCtx(), next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('respects a short ttl and re-invokes after expiry', async () => {
    vi.useFakeTimers();
    const next = vi.fn().mockResolvedValue('value');
    const options: CacheBehaviorOptions = { ttl: 50 };

    await behavior.handle(makeCtx(options), next);
    vi.advanceTimersByTime(100);
    await behavior.handle(makeCtx(options), next);

    expect(next).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('produces a stable key regardless of property order', async () => {
    const next = vi.fn().mockResolvedValue('value');

    const ctxA = makeCtx(undefined, { request: { a: 1, b: 2 } });
    const ctxB = makeCtx(undefined, { request: { b: 2, a: 1 } });

    await behavior.handle(ctxA, next);
    await behavior.handle(ctxB, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctxA.items.get(CACHE_KEY_ITEM)).toBe(ctxB.items.get(CACHE_KEY_ITEM));
  });

  it('merges module defaults under per-handler options', async () => {
    const next = vi.fn().mockResolvedValue('value');
    const withDefaults = new CacheBehavior(cache, { kinds: ['command'] });

    // Default kinds = ['command']; a query should now pass through.
    await withDefaults.handle(
      makeCtx(undefined, { requestKind: 'query' }),
      next,
    );
    await withDefaults.handle(
      makeCtx(undefined, { requestKind: 'query' }),
      next,
    );

    expect(next).toHaveBeenCalledTimes(2);
  });
});
