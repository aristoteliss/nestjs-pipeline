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

import { TimeoutStrategy, timeout } from 'cockatiel';
import { describe, expect, it, vi } from 'vitest';
import { buildResiliencePolicy, type PolicyBuildContext } from './policy-factory';

describe('buildResiliencePolicy', () => {
  const ctx: PolicyBuildContext = {
    requestName: 'TestCommand',
    handlerName: 'TestHandler',
    logger: {
      log: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };

  it('returns null when options are empty', () => {
    const policy = buildResiliencePolicy({}, ctx);
    expect(policy).toBeNull();
  });

  it('returns custom pre-built policy when provided', () => {
    const custom = timeout(1000, TimeoutStrategy.Aggressive);
    const policy = buildResiliencePolicy({ policy: custom }, ctx);
    expect(policy).toBe(custom);
  });

  describe('retry layer', () => {
    it('builds retry with constant backoff', async () => {
      const onRetry = vi.fn();
      const policy = buildResiliencePolicy(
        {
          retry: {
            maxAttempts: 2,
            backoff: { type: 'constant', delay: 10 },
          },
          telemetry: { onRetry },
        },
        ctx,
      );

      expect(policy).not.toBeNull();
      let attempts = 0;
      const result = await policy!.execute(async () => {
        attempts++;
        if (attempts === 1) throw new Error('fail 1');
        return 'success';
      });

      expect(result).toBe('success');
      expect(attempts).toBe(2);
      expect(onRetry).toHaveBeenCalledWith({ attempt: 1, delay: 10 });
    });

    it('builds retry with iterable backoff', async () => {
      const policy = buildResiliencePolicy(
        {
          retry: {
            maxAttempts: 3,
            backoff: { type: 'iterable', delays: [5, 10] },
          },
        },
        ctx,
      );

      let attempts = 0;
      const result = await policy!.execute(async () => {
        attempts++;
        if (attempts < 3) throw new Error('fail');
        return 'recovered';
      });

      expect(result).toBe('recovered');
      expect(attempts).toBe(3);
    });

    it('builds retry with exponential backoff and various jitter strategies', () => {
      for (const jitter of ['none', 'full', 'half', 'decorrelated'] as const) {
        const policy = buildResiliencePolicy(
          {
            retry: {
              maxAttempts: 3,
              backoff: {
                type: 'exponential',
                initialDelay: 10,
                maxDelay: 100,
                exponent: 2,
                jitter,
              },
            },
          },
          ctx,
        );
        expect(policy).not.toBeNull();
      }
    });
  });

  describe('circuit breaker layer', () => {
    it('builds consecutive circuit breaker and emits lifecycle events', async () => {
      const onCircuitOpen = vi.fn();
      const policy = buildResiliencePolicy(
        {
          circuitBreaker: {
            halfOpenAfter: 50,
            breaker: { type: 'consecutive', threshold: 2 },
          },
          telemetry: { onCircuitOpen },
        },
        ctx,
      );

      expect(policy).not.toBeNull();
      await expect(policy!.execute(async () => { throw new Error('err1'); })).rejects.toThrow('err1');
      await expect(policy!.execute(async () => { throw new Error('err2'); })).rejects.toThrow('err2');
      expect(onCircuitOpen).toHaveBeenCalled();
    });

    it('builds sampling circuit breaker', () => {
      const policy = buildResiliencePolicy(
        {
          circuitBreaker: {
            halfOpenAfter: 100,
            breaker: { type: 'sampling', threshold: 0.5, duration: 1000, minimumRps: 5 },
          },
        },
        ctx,
      );
      expect(policy).not.toBeNull();
    });

    it('builds count circuit breaker', () => {
      const policy = buildResiliencePolicy(
        {
          circuitBreaker: {
            halfOpenAfter: 100,
            breaker: { type: 'count', threshold: 0.5, size: 10, minimumNumberOfCalls: 5 },
          },
        },
        ctx,
      );
      expect(policy).not.toBeNull();
    });
  });

  describe('bulkhead layer', () => {
    it('builds bulkhead with limit and queue', async () => {
      const onBulkheadRejected = vi.fn();
      const policy = buildResiliencePolicy(
        {
          bulkhead: { limit: 1, queue: 0 },
          telemetry: { onBulkheadRejected },
        },
        ctx,
      );

      expect(policy).not.toBeNull();
      const slow = policy!.execute(() => new Promise((resolve) => setTimeout(resolve, 50)));
      await expect(policy!.execute(async () => 'second')).rejects.toThrow();
      expect(onBulkheadRejected).toHaveBeenCalled();
      await slow;
    });
  });

  describe('timeout layer', () => {
    it('builds cooperative timeout policy', async () => {
      const onTimeout = vi.fn();
      const policy = buildResiliencePolicy(
        {
          timeout: { duration: 20, strategy: 'cooperative' },
          telemetry: { onTimeout },
        },
        ctx,
      );

      expect(policy).not.toBeNull();
    });

    it('builds aggressive timeout policy and triggers onTimeout', async () => {
      const onTimeout = vi.fn();
      const policy = buildResiliencePolicy(
        {
          timeout: { duration: 10, strategy: 'aggressive' },
          telemetry: { onTimeout },
        },
        ctx,
      );

      await expect(
        policy!.execute(() => new Promise((resolve) => setTimeout(resolve, 50))),
      ).rejects.toThrow();
      expect(onTimeout).toHaveBeenCalled();
    });
  });

  describe('fallback layer', () => {
    it('returns static fallback value on error', async () => {
      const policy = buildResiliencePolicy(
        {
          fallback: { value: 'fallback-val' },
        },
        ctx,
      );

      const result = await policy!.execute(async () => {
        throw new Error('primary failed');
      });
      expect(result).toBe('fallback-val');
    });

    it('invokes fallback factory on error', async () => {
      const policy = buildResiliencePolicy(
        {
          fallback: { factory: () => 'dynamic-fallback' },
        },
        ctx,
      );

      const result = await policy!.execute(async () => {
        throw new Error('primary failed');
      });
      expect(result).toBe('dynamic-fallback');
    });
  });

  describe('custom handle predicate', () => {
    class IgnoredError extends Error { }
    class HandledError extends Error { }

    it('only retries errors matching the handle predicate', async () => {
      const policy = buildResiliencePolicy(
        {
          handle: (err) => err instanceof HandledError,
          retry: { maxAttempts: 3, backoff: { type: 'constant', delay: 1 } },
        },
        ctx,
      );

      let attempts = 0;
      await expect(
        policy!.execute(async () => {
          attempts++;
          throw new IgnoredError('do not retry');
        }),
      ).rejects.toThrow(IgnoredError);
      expect(attempts).toBe(1);
    });
  });

  describe('custom composition order', () => {
    it('composes layers in custom order', async () => {
      const policy = buildResiliencePolicy(
        {
          order: ['retry', 'fallback'],
          retry: { maxAttempts: 2, backoff: { type: 'constant', delay: 1 } },
          fallback: { value: 'fallback-after-retry' },
        },
        ctx,
      );

      const result = await policy!.execute(async () => {
        throw new Error('always fail');
      });
      expect(result).toBe('fallback-after-retry');
    });
  });
});

