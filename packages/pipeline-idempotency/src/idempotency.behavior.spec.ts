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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdempotencyConflictError } from './errors/idempotency-conflict.error';
import {
  IDEMPOTENCY_KEY_ITEM,
  IDEMPOTENCY_OWNERSHIP_LOST_ITEM,
  IDEMPOTENCY_REPLAYED_ITEM,
  IdempotencyBehavior,
} from './idempotency.behavior';
import type { IdempotencyBehaviorOptions } from './interfaces/idempotency-options.interface';
import type { IdempotencyRecord } from './interfaces/idempotency-record.interface';
import type { IdempotencyStore } from './interfaces/idempotency-store.interface';
import { MemoryIdempotencyStore } from './stores/memory.store';

function makeCtx(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'corr-123',
    request: { orderId: 'o1', amount: 100 },
    requestType: class CreateOrderCommand {},
    requestName: 'CreateOrderCommand',
    handlerType: class CreateOrderHandler {},
    handlerName: 'CreateOrderHandler',
    requestKind: 'command',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as unknown as IPipelineContext;
}

function withOptions(
  ctx: IPipelineContext,
  options: IdempotencyBehaviorOptions,
): IPipelineContext {
  vi.mocked(ctx.getBehaviorOptions).mockReturnValue(
    options as unknown as ReturnType<IPipelineContext['getBehaviorOptions']>,
  );
  return ctx;
}

const byKey: IdempotencyBehaviorOptions = {
  keyFactory: (c) => (c.request as { orderId: string }).orderId,
};

describe('IdempotencyBehavior', () => {
  let store: MemoryIdempotencyStore;

  beforeEach(() => {
    store = new MemoryIdempotencyStore();
  });

  it('runs the handler, stores the response, and returns it on first call', async () => {
    const behavior = new IdempotencyBehavior(store);
    const next = vi.fn().mockResolvedValue({ id: 'created' });

    const result = await behavior.handle(withOptions(makeCtx(), byKey), next);

    expect(result).toEqual({ id: 'created' });
    expect(next).toHaveBeenCalledTimes(1);
    const record = (await store.get('o1')) as IdempotencyRecord;
    expect(record.status).toBe('completed');
    expect(record.response).toEqual({ id: 'created' });
    expect(record.claimId).toEqual(expect.any(String));
  });

  it('replays the stored response without running the handler on a duplicate', async () => {
    const behavior = new IdempotencyBehavior(store);
    const first = vi.fn().mockResolvedValue({ id: 'created' });
    await behavior.handle(withOptions(makeCtx(), byKey), first);

    const second = vi.fn().mockResolvedValue({ id: 'SHOULD_NOT_RUN' });
    const ctx = withOptions(makeCtx(), byKey);
    const result = await behavior.handle(ctx, second);

    expect(result).toEqual({ id: 'created' });
    expect(second).not.toHaveBeenCalled();
    expect(ctx.items.get(IDEMPOTENCY_REPLAYED_ITEM)).toBe(true);
  });

  it('exposes the active key on the context', async () => {
    const behavior = new IdempotencyBehavior(store);
    const ctx = withOptions(makeCtx(), byKey);

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    expect(ctx.items.get(IDEMPOTENCY_KEY_ITEM)).toBe('o1');
  });

  it('throws a 409 conflict while a duplicate is still in progress', async () => {
    const mockStore: IdempotencyStore = {
      get: vi.fn().mockResolvedValue({
        key: 'o1',
        status: 'in_progress',
        requestName: 'CreateOrderCommand',
        claimId: 'existing-owner',
        createdAt: new Date().toISOString(),
      }),
      setIfAbsent: vi.fn().mockResolvedValue(false),
      completeIfOwned: vi.fn(),
      deleteIfOwned: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const behavior = new IdempotencyBehavior(mockStore);
    const next = vi.fn();

    await expect(
      behavior.handle(withOptions(makeCtx(), byKey), next),
    ).rejects.toMatchObject({ statusCode: 409, reason: 'in_progress' });
    expect(next).not.toHaveBeenCalled();
  });

  it('throws a 422 conflict when the key is reused with a different payload', async () => {
    const behavior = new IdempotencyBehavior(store);
    await behavior.handle(
      withOptions(makeCtx(), byKey),
      vi.fn().mockResolvedValue('first'),
    );

    const ctx = withOptions(
      makeCtx({ request: { orderId: 'o1', amount: 999 } }),
      byKey,
    );

    await expect(
      behavior.handle(ctx, vi.fn().mockResolvedValue('second')),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(behavior.handle(ctx, vi.fn())).rejects.toMatchObject({
      statusCode: 422,
      reason: 'key_reuse',
    });
  });

  it('skips fingerprint checks when fingerprinting is disabled', async () => {
    const behavior = new IdempotencyBehavior(store);
    const opts: IdempotencyBehaviorOptions = { ...byKey, fingerprint: false };
    await behavior.handle(
      withOptions(makeCtx(), opts),
      vi.fn().mockResolvedValue('first'),
    );

    const ctx = withOptions(
      makeCtx({ request: { orderId: 'o1', amount: 999 } }),
      opts,
    );
    const result = await behavior.handle(ctx, vi.fn());

    expect(result).toBe('first');
    expect(ctx.items.get(IDEMPOTENCY_REPLAYED_ITEM)).toBe(true);
  });

  it('runs the handler normally when no key is produced', async () => {
    const behavior = new IdempotencyBehavior(store);
    const ctx = withOptions(makeCtx(), {
      keyFactory: () => undefined,
    });
    const next = vi.fn().mockResolvedValue('ran');

    const result = await behavior.handle(ctx, next);

    expect(result).toBe('ran');
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.items.has(IDEMPOTENCY_KEY_ITEM)).toBe(false);
  });

  it('runs the handler for out-of-scope request kinds', async () => {
    const behavior = new IdempotencyBehavior(store);
    const next = vi.fn().mockResolvedValue('query-result');
    const ctx = withOptions(makeCtx({ requestKind: 'query' }), byKey);

    const result = await behavior.handle(ctx, next);

    expect(result).toBe('query-result');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('releases the key and rethrows when the handler fails (releaseOnError)', async () => {
    const behavior = new IdempotencyBehavior(store);
    const boom = new Error('handler failed');
    const ctx = withOptions(makeCtx(), byKey);

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(boom)),
    ).rejects.toBe(boom);

    expect(await store.get('o1')).toBeUndefined();

    const retry = vi.fn().mockResolvedValue('ok');
    const result = await behavior.handle(withOptions(makeCtx(), byKey), retry);
    expect(result).toBe('ok');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('keeps the key claimed when releaseOnError is false', async () => {
    const behavior = new IdempotencyBehavior(store);
    const ctx = withOptions(makeCtx(), { ...byKey, releaseOnError: false });

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(new Error('x'))),
    ).rejects.toThrow('x');

    const record = await store.get('o1');
    expect(record?.status).toBe('in_progress');
  });

  it('does not release a successfully executed key when persisting the completed record fails', async () => {
    const persistenceError = new Error('store unavailable');
    const mockStore: IdempotencyStore = {
      get: vi.fn(),
      setIfAbsent: vi.fn().mockResolvedValue(true),
      completeIfOwned: vi.fn().mockRejectedValue(persistenceError),
      deleteIfOwned: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const behavior = new IdempotencyBehavior(mockStore);
    const next = vi.fn().mockResolvedValue({ id: 'already-created' });

    await expect(
      behavior.handle(withOptions(makeCtx(), byKey), next),
    ).rejects.toBe(persistenceError);

    expect(next).toHaveBeenCalledTimes(1);
    expect(mockStore.deleteIfOwned).not.toHaveBeenCalled();
    expect(mockStore.delete).not.toHaveBeenCalled();
  });

  it('returns the successful result without overwriting a newer claim when ownership is lost', async () => {
    let claimedRecord: IdempotencyRecord | undefined;
    const mockStore: IdempotencyStore = {
      get: vi.fn(),
      setIfAbsent: vi.fn((_key, record) => {
        claimedRecord = record;
        return true;
      }),
      completeIfOwned: vi.fn().mockResolvedValue(false),
      deleteIfOwned: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const logger = { error: vi.fn(), debug: vi.fn(), warn: vi.fn() };
    const behavior = new IdempotencyBehavior(mockStore, undefined, logger);
    const ctx = withOptions(makeCtx(), byKey);

    const result = await behavior.handle(
      ctx,
      vi.fn().mockResolvedValue({ id: 'already-created' }),
    );

    expect(result).toEqual({ id: 'already-created' });
    expect(claimedRecord?.claimId).toEqual(expect.any(String));
    expect(mockStore.completeIfOwned).toHaveBeenCalledWith(
      'o1',
      claimedRecord?.claimId,
      expect.objectContaining({
        status: 'completed',
        claimId: claimedRecord?.claimId,
      }),
      expect.any(Number),
    );
    expect(ctx.items.get(IDEMPOTENCY_OWNERSHIP_LOST_ITEM)).toBe(true);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('uses the same claim owner when releasing a failed execution', async () => {
    let claimedRecord: IdempotencyRecord | undefined;
    const mockStore: IdempotencyStore = {
      get: vi.fn(),
      setIfAbsent: vi.fn((_key, record) => {
        claimedRecord = record;
        return true;
      }),
      completeIfOwned: vi.fn(),
      deleteIfOwned: vi.fn().mockResolvedValue(false),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const behavior = new IdempotencyBehavior(mockStore);
    const boom = new Error('handler failed');

    await expect(
      behavior.handle(
        withOptions(makeCtx(), byKey),
        vi.fn().mockRejectedValue(boom),
      ),
    ).rejects.toBe(boom);

    expect(mockStore.deleteIfOwned).toHaveBeenCalledWith(
      'o1',
      claimedRecord?.claimId,
    );
    expect(mockStore.delete).not.toHaveBeenCalled();
  });

  it('treats a lost claim with no stored record as an in-progress conflict', async () => {
    const mockStore: IdempotencyStore = {
      get: vi.fn().mockResolvedValue(undefined),
      setIfAbsent: vi.fn().mockResolvedValue(false),
      completeIfOwned: vi.fn(),
      deleteIfOwned: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const behavior = new IdempotencyBehavior(mockStore);

    await expect(
      behavior.handle(withOptions(makeCtx(), byKey), vi.fn()),
    ).rejects.toMatchObject({ statusCode: 409, reason: 'in_progress' });
  });

  it('merges module defaults under per-handler options', async () => {
    const behavior = new IdempotencyBehavior(store, { scope: ['event'] });
    const next = vi.fn().mockResolvedValue('ran');
    const ctx = withOptions(makeCtx(), byKey);

    const result = await behavior.handle(ctx, next);

    expect(result).toBe('ran');
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.items.has(IDEMPOTENCY_KEY_ITEM)).toBe(false);
  });
});
