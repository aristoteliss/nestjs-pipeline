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
import { TaskCancelledError } from 'cockatiel';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResilienceBehaviorOptions } from './interfaces/resilience-options.interface';
import { ResilienceBehavior } from './resilience.behavior';

// ─── Context factory ──────────────────────────────────────────────────────────

function makeCtx(
  options?: ResilienceBehaviorOptions,
  overrides: Partial<IPipelineContext> = {},
): IPipelineContext {
  return {
    correlationId: 'test-corr-id',
    originalCorrelationId: 'test-corr-id',
    request: {},
    requestType: class TestRequest {},
    requestName: 'TestCommand',
    handlerType: overrides.handlerType ?? class TestHandler {},
    handlerName: 'TestHandler',
    requestKind: 'command',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(options),
    ...overrides,
  } as unknown as IPipelineContext;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ResilienceBehavior', () => {
  let behavior: ResilienceBehavior;

  beforeEach(() => {
    behavior = new ResilienceBehavior();
  });

  it('passes through when no options are configured', async () => {
    const next = vi.fn().mockResolvedValue('ok');
    const result = await behavior.handle(makeCtx(undefined), next);

    expect(result).toBe('ok');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('retries a transient failure and then succeeds', async () => {
    const next = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');

    const result = await behavior.handle(
      makeCtx({
        retry: { maxAttempts: 3, backoff: { type: 'constant', delay: 0 } },
      }),
      next,
    );

    expect(result).toBe('recovered');
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('exhausts retries and rethrows the last error', async () => {
    const next = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      behavior.handle(
        makeCtx({
          retry: { maxAttempts: 2, backoff: { type: 'constant', delay: 0 } },
        }),
        next,
      ),
    ).rejects.toThrow('always fails');

    // 1 initial attempt + 2 retries
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('returns the fallback value when the handler fails', async () => {
    const next = vi.fn().mockRejectedValue(new Error('down'));

    const result = await behavior.handle(
      makeCtx({ fallback: { value: 'default' } }),
      next,
    );

    expect(result).toBe('default');
  });

  it('uses a fallback factory when provided', async () => {
    const next = vi.fn().mockRejectedValue(new Error('down'));
    const factory = vi.fn().mockReturnValue('made');

    const result = await behavior.handle(
      makeCtx({ fallback: { factory } }),
      next,
    );

    expect(result).toBe('made');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('cancels with a timeout when the handler is too slow', async () => {
    const next = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve('late'), 50)),
    );

    await expect(
      behavior.handle(
        makeCtx({ timeout: { duration: 5, strategy: 'aggressive' } }),
        next,
      ),
    ).rejects.toBeInstanceOf(TaskCancelledError);
  });

  it('only honours errors accepted by the handle predicate', async () => {
    const next = vi.fn().mockRejectedValue(new Error('do-not-retry'));
    const handle = vi.fn().mockReturnValue(false);

    await expect(
      behavior.handle(
        makeCtx({
          retry: { maxAttempts: 5, backoff: { type: 'constant', delay: 0 } },
          handle,
        }),
        next,
      ),
    ).rejects.toThrow('do-not-retry');

    // Not retried because the predicate rejected the error.
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('invokes the onRetry telemetry hook', async () => {
    const next = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');
    const onRetry = vi.fn();

    await behavior.handle(
      makeCtx({
        retry: { maxAttempts: 2, backoff: { type: 'constant', delay: 0 } },
        telemetry: { onRetry },
      }),
      next,
    );

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ attempt: expect.any(Number) }),
    );
  });

  it('builds the policy once per handler and caches it', async () => {
    const ctx = makeCtx({ fallback: { value: 'x' } });
    const next = vi.fn().mockResolvedValue('ok');

    await behavior.handle(ctx, next);
    await behavior.handle(ctx, next);

    // getBehaviorOptions is only consulted on the first (uncached) resolution.
    expect(ctx.getBehaviorOptions).toHaveBeenCalledTimes(1);
  });

  it('merges per-handler options over application defaults', async () => {
    const withDefaults = new ResilienceBehavior({
      retry: { maxAttempts: 5, backoff: { type: 'constant', delay: 0 } },
    });

    // Handler overrides retry with a fallback-only config (retry dropped).
    const next = vi.fn().mockRejectedValue(new Error('boom'));
    const result = await withDefaults.handle(
      makeCtx({
        retry: { maxAttempts: 1, backoff: { type: 'constant', delay: 0 } },
        fallback: { value: 'fb' },
      }),
      next,
    );

    expect(result).toBe('fb');
    // 1 initial + 1 retry from the overridden maxAttempts.
    expect(next).toHaveBeenCalledTimes(2);
  });
});
