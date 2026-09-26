/* Copyright (C) 2026-present Aristotelis — see repository license. */

import 'reflect-metadata';
import { BrokenCircuitError, BulkheadRejectedError } from 'cockatiel';
import { describe, expect, it, vi } from 'vitest';
import { ResiliencePolicyConfigurationError } from './errors/resilience-policy-configuration.error';
import type { ResiliencePolicyOptions } from './interfaces/resilience-options.interface';
import {
  InjectResiliencePolicy,
  ResiliencePolicies,
} from './resilience-policies';

const logger = () => ({
  log: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
});

function registry(
  policies: Record<string, ResiliencePolicyOptions>,
  log = logger(),
): ResiliencePolicies {
  return new ResiliencePolicies(policies, log as never);
}

describe('ResiliencePolicies', () => {
  it('builds each named policy once and returns the same instance to every caller', () => {
    const policies = registry({
      paymentsApi: { timeout: { duration: 1000 } },
      smtp: { bulkhead: { limit: 1 } },
    });

    expect(policies.names).toEqual(['paymentsApi', 'smtp']);
    expect(policies.get('paymentsApi')).toBe(policies.get('paymentsApi'));
    expect(policies.get('paymentsApi')).not.toBe(policies.get('smtp'));
  });

  it('runs a call through the policy, passing the abort signal, and retries handled failures', async () => {
    const onRetry = vi.fn();
    const policies = registry({
      paymentsApi: {
        handle: (error) => error instanceof Error && error.message === 'busy',
        retry: { maxAttempts: 2, backoff: { type: 'constant', delay: 0 } },
        telemetry: { onRetry },
      },
    });
    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error('busy'))
      .mockResolvedValue('charged');

    await expect(policies.execute('paymentsApi', call)).resolves.toBe(
      'charged',
    );

    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[0]?.[0].signal).toBeInstanceOf(AbortSignal);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ policyName: 'paymentsApi', attempt: 1 }),
    );
  });

  it('shares one circuit breaker between callers and names the policy in logs and telemetry', async () => {
    const onCircuitOpen = vi.fn();
    const onCircuitHalfOpen = vi.fn();
    const onCircuitClose = vi.fn();
    const log = logger();
    const policies = registry(
      {
        paymentsApi: {
          handleAllErrors: true,
          circuitBreaker: {
            halfOpenAfter: 15,
            breaker: { type: 'consecutive', threshold: 2 },
          },
          telemetry: { onCircuitOpen, onCircuitHalfOpen, onCircuitClose },
        },
      },
      log,
    );
    const failing = () => Promise.reject(new Error('gateway down'));

    await expect(policies.execute('paymentsApi', failing)).rejects.toThrow(
      'gateway down',
    );
    await expect(policies.execute('paymentsApi', failing)).rejects.toThrow(
      'gateway down',
    );
    await expect(
      policies.execute('paymentsApi', () => 'from another handler'),
    ).rejects.toBeInstanceOf(BrokenCircuitError);

    expect(onCircuitOpen).toHaveBeenCalledWith({ policyName: 'paymentsApi' });
    expect(log.warn).toHaveBeenCalledWith(
      "[resilience] circuit OPEN for policy 'paymentsApi'",
      'ResilienceBehavior',
    );

    await new Promise((resolve) => setTimeout(resolve, 30));
    await expect(policies.execute('paymentsApi', () => 'ok')).resolves.toBe(
      'ok',
    );
    expect(onCircuitHalfOpen).toHaveBeenCalledWith({
      policyName: 'paymentsApi',
    });
    expect(onCircuitClose).toHaveBeenCalledWith({ policyName: 'paymentsApi' });
  });

  it('returns a fallback value or factory result in place of a handled failure', async () => {
    const factory = vi.fn().mockReturnValue('made');
    const policies = registry({
      cached: { handleAllErrors: true, fallback: { value: 'default' } },
      computed: { handleAllErrors: true, fallback: { factory } },
    });
    const failing = () => Promise.reject(new Error('down'));

    await expect(policies.execute('cached', failing)).resolves.toBe('default');
    await expect(policies.execute('computed', failing)).resolves.toBe('made');
    expect(factory).toHaveBeenCalledOnce();
  });

  it('reports a bulkhead rejection with the policy name', async () => {
    const onBulkheadRejected = vi.fn();
    const policies = registry({
      smtp: { bulkhead: { limit: 1 }, telemetry: { onBulkheadRejected } },
    });
    let release: () => void = () => undefined;
    const running = policies.execute(
      'smtp',
      () => new Promise<void>((resolve) => (release = resolve)),
    );

    await expect(
      policies.execute('smtp', () => 'second'),
    ).rejects.toBeInstanceOf(BulkheadRejectedError);
    expect(onBulkheadRejected).toHaveBeenCalledWith({ policyName: 'smtp' });
    release();
    await running;
  });

  it('throws a configuration error naming the declared policies for an unknown name', () => {
    expect(() =>
      registry({ smtp: { bulkhead: { limit: 1 } } }).get('sms'),
    ).toThrow(
      "Invalid resilience policy 'sms': no policy has this name; declared: smtp",
    );
    expect(() => registry({}).get('sms')).toThrow('declared: (none)');
  });

  it('fails at startup for a retry, breaker or fallback without an error classifier', () => {
    for (const options of [
      { retry: { maxAttempts: 1 } },
      {
        circuitBreaker: {
          halfOpenAfter: 10,
          breaker: { type: 'consecutive' as const, threshold: 1 },
        },
      },
      { fallback: { value: 'x' } },
    ]) {
      expect(() => registry({ paymentsApi: options })).toThrow(
        ResiliencePolicyConfigurationError,
      );
    }
  });

  it('fails at startup for a policy that configures no layer', () => {
    expect(() => registry({ empty: {} })).toThrow(
      "Invalid resilience policy 'empty': it configures no layer",
    );
    expect(() =>
      registry({ unordered: { timeout: { duration: 10 }, order: ['retry'] } }),
    ).toThrow(ResiliencePolicyConfigurationError);
  });

  it('works without declared policies or an injected logger', () => {
    expect(new ResiliencePolicies().names).toEqual([]);
    expect(
      new ResiliencePolicies({ smtp: { bulkhead: { limit: 1 } } }).names,
    ).toEqual(['smtp']);
  });
});

describe('InjectResiliencePolicy', () => {
  it('injects the token of the named policy', () => {
    class PaymentsClient {
      constructor(
        @InjectResiliencePolicy('paymentsApi') readonly policy: unknown,
      ) {}
    }

    expect(Reflect.getMetadata('self:paramtypes', PaymentsClient)).toEqual([
      { index: 0, param: 'ResiliencePolicy:paymentsApi' },
    ]);
  });
});
