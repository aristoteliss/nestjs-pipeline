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
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RateLimitExceededError } from './errors/rate-limit-exceeded.error';
import type { RateLimitBehaviorOptions } from './interfaces/rate-limit-options.interface';
import type {
  RateLimiterLike,
  RateLimiterResLike,
} from './interfaces/rate-limiter.interface';
import {
  RATE_LIMIT_ITEM,
  RATE_LIMIT_KEY_ITEM,
  RateLimitBehavior,
} from './rate-limit.behavior';

// ─── Doubles ──────────────────────────────────────────────────────────────────

function okRes(over: Partial<RateLimiterResLike> = {}): RateLimiterResLike {
  return {
    msBeforeNext: 1000,
    remainingPoints: 9,
    consumedPoints: 1,
    isFirstInDuration: false,
    ...over,
  };
}

function makeCtx(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'corr-123',
    originalCorrelationId: 'corr-123',
    request: { ip: '10.0.0.1' },
    requestType: class CreateUserCommand {},
    requestName: 'CreateUserCommand',
    handlerType: class CreateUserHandler {},
    handlerName: 'CreateUserHandler',
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
  options: RateLimitBehaviorOptions,
): IPipelineContext {
  vi.mocked(ctx.getBehaviorOptions).mockReturnValue(
    options as unknown as ReturnType<IPipelineContext['getBehaviorOptions']>,
  );
  return ctx;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('RateLimitBehavior', () => {
  const consume = vi.fn();
  const limiter: RateLimiterLike = { consume, points: 10 };

  beforeEach(() => {
    consume.mockReset();
  });

  it('consumes 1 point by default, keyed by requestName, and proceeds', async () => {
    consume.mockResolvedValue(okRes());
    const behavior = new RateLimitBehavior(limiter);
    const ctx = makeCtx();
    const next = vi.fn().mockResolvedValue('handled');

    const result = await behavior.handle(ctx, next);

    expect(consume).toHaveBeenCalledWith('CreateUserCommand', 1);
    expect(next).toHaveBeenCalledTimes(1);
    expect(result).toBe('handled');
    expect(ctx.items.get(RATE_LIMIT_KEY_ITEM)).toBe('CreateUserCommand');
    expect(ctx.items.get(RATE_LIMIT_ITEM)).toMatchObject({
      remainingPoints: 9,
    });
  });

  it('applies keyFactory, keyPrefix, and a custom point cost', async () => {
    consume.mockResolvedValue(okRes());
    const behavior = new RateLimitBehavior(limiter);
    const ctx = withOptions(makeCtx(), {
      points: 5,
      keyPrefix: 'api',
      keyFactory: (c) => `${c.requestName}:${(c.request as { ip: string }).ip}`,
    });

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    expect(consume).toHaveBeenCalledWith('api:CreateUserCommand:10.0.0.1', 5);
  });

  it('throws RateLimitExceededError when the limiter rejects with a result', async () => {
    consume.mockRejectedValue(
      okRes({ msBeforeNext: 2500, remainingPoints: 0 }),
    );
    const behavior = new RateLimitBehavior(limiter);
    const ctx = makeCtx();
    const next = vi.fn();

    const error = await behavior.handle(ctx, next).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitExceededError);
    expect(error).toMatchObject({
      key: 'CreateUserCommand',
      requestName: 'CreateUserCommand',
      msBeforeNext: 2500,
      retryAfterSeconds: 3,
      remainingPoints: 0,
      limit: 10,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('fails open on a store error by default (allows the request)', async () => {
    consume.mockRejectedValue(new Error('redis down'));
    const behavior = new RateLimitBehavior(limiter);
    const next = vi.fn().mockResolvedValue('handled');

    const result = await behavior.handle(makeCtx(), next);

    expect(result).toBe('handled');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fails closed on a store error when failOpen=false', async () => {
    const boom = new Error('redis down');
    consume.mockRejectedValue(boom);
    const behavior = new RateLimitBehavior(limiter);
    const ctx = withOptions(makeCtx(), { failOpen: false });
    const next = vi.fn();

    await expect(behavior.handle(ctx, next)).rejects.toBe(boom);
    expect(next).not.toHaveBeenCalled();
  });

  it('uses a per-handler limiter override', async () => {
    const overrideConsume = vi.fn().mockResolvedValue(okRes());
    const behavior = new RateLimitBehavior(limiter);
    const ctx = withOptions(makeCtx(), {
      limiter: { consume: overrideConsume },
    });

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    expect(overrideConsume).toHaveBeenCalledTimes(1);
    expect(consume).not.toHaveBeenCalled();
  });

  it('merges module defaults under per-handler options (handler wins)', async () => {
    consume.mockResolvedValue(okRes());
    const behavior = new RateLimitBehavior(limiter, { points: 3 });
    const ctx = withOptions(makeCtx(), { points: 7 });

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    expect(consume).toHaveBeenCalledWith('CreateUserCommand', 7);
  });

  // ── Integration: prove the real rate-limiter-flexible limiter is a drop-in ──
  it('integrates with a real RateLimiterMemory (3rd call is throttled)', async () => {
    const realLimiter = new RateLimiterMemory({ points: 2, duration: 60 });
    const behavior = new RateLimitBehavior(realLimiter);
    const next = vi.fn().mockResolvedValue('ok');

    await behavior.handle(makeCtx(), next);
    await behavior.handle(makeCtx(), next);

    await expect(behavior.handle(makeCtx(), next)).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
    expect(next).toHaveBeenCalledTimes(2);
  });
});
