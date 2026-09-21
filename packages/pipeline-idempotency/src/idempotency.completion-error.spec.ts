/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { IdempotencyCompletionError } from './errors/idempotency-completion.error';
import { IdempotencyBehavior } from './idempotency.behavior';
import type { IdempotencyStore } from './interfaces/idempotency-store.interface';

function context(): IPipelineContext {
  return {
    correlationId: 'corr',
    request: { amount: 10 },
    requestType: class TestCommand {},
    requestName: 'TestCommand',
    handlerType: class TestHandler {},
    handlerName: 'TestHandler',
    requestKind: 'command',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue({
      keyFactory: () => 'idem-1',
      ttl: 60_000,
    }),
  } as unknown as IPipelineContext;
}

describe('IdempotencyBehavior completion failures', () => {
  it('marks a post-success completion-store failure distinctly', async () => {
    const storageFailure = new Error('redis unavailable');
    const store: IdempotencyStore = {
      get: vi.fn(),
      setIfAbsent: vi.fn().mockResolvedValue(true),
      completeIfOwned: vi.fn().mockRejectedValue(storageFailure),
      deleteIfOwned: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const next = vi.fn().mockResolvedValue({ paymentId: 'p-1' });

    let caught: unknown;
    try {
      await new IdempotencyBehavior(store).handle(context(), next);
    } catch (error) {
      caught = error;
    }

    expect(next).toHaveBeenCalledOnce();
    expect(caught).toBeInstanceOf(IdempotencyCompletionError);
    expect(caught).toMatchObject({
      executionSucceeded: true,
      key: 'idem-1',
      cause: storageFailure,
    });
  });

  it('continues returning the successful result when ownership is merely lost', async () => {
    const store: IdempotencyStore = {
      get: vi.fn(),
      setIfAbsent: vi.fn().mockResolvedValue(true),
      completeIfOwned: vi.fn().mockResolvedValue(false),
      deleteIfOwned: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const ctx = context();

    await expect(
      new IdempotencyBehavior(store).handle(
        ctx,
        vi.fn().mockResolvedValue({ ok: true }),
      ),
    ).resolves.toEqual({ ok: true });
  });
});
