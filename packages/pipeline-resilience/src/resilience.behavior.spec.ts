/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IPipelineBehaviorContract,
  type IPipelineContext,
  PIPELINE_BEHAVIOR_CONTRACT,
} from '@nestjs-pipeline/core';
import { TaskCancelledError } from 'cockatiel';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResilienceConfigurationError } from './errors/resilience-configuration.error';
import type { ResilienceBehaviorOptions } from './interfaces/resilience-options.interface';
import { ResilienceBehavior } from './resilience.behavior';

function makeCtx(
  options?: ResilienceBehaviorOptions,
  overrides: Partial<IPipelineContext> = {},
): IPipelineContext {
  return {
    correlationId: 'test-corr-id',
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

describe('ResilienceBehavior', () => {
  let behavior: ResilienceBehavior;

  beforeEach(() => {
    behavior = new ResilienceBehavior();
  });

  it('does not mutate a shared logger and supplies its context per call', async () => {
    const logger = {
      debug: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
      setContext: vi.fn(),
    };
    const sharedLoggerBehavior = new ResilienceBehavior(
      undefined,
      logger as never,
    );
    const next = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('ok');

    await sharedLoggerBehavior.handle(
      makeCtx({
        retry: {
          maxAttempts: 1,
          replaySafe: true,
          backoff: { type: 'constant', delay: 0 },
        },
        handleAllErrors: true,
      }),
      next,
    );

    expect(logger.setContext).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('[resilience] retrying'),
      ResilienceBehavior.name,
    );
  });

  it('passes through when no options are configured', async () => {
    const next = vi.fn().mockResolvedValue('ok');
    const result = await behavior.handle(makeCtx(undefined), next);

    expect(result).toBe('ok');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('retries a replay-safe transient command failure and then succeeds', async () => {
    const next = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');

    const result = await behavior.handle(
      makeCtx({
        retry: {
          maxAttempts: 3,
          replaySafe: true,
          backoff: { type: 'constant', delay: 0 },
        },
        handleAllErrors: true,
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
          retry: {
            maxAttempts: 2,
            replaySafe: true,
            backoff: { type: 'constant', delay: 0 },
          },
          handleAllErrors: true,
        }),
        next,
      ),
    ).rejects.toThrow('always fails');

    // 1 initial attempt + 2 retries
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('cancels with a timeout when the handler is too slow', async () => {
    const next = vi.fn(
      () => new Promise((resolve) => setTimeout(() => resolve('late'), 50)),
    );

    await expect(
      behavior.handle(
        makeCtx({
          timeout: { duration: 5, strategy: 'aggressive', replaySafe: true },
        }),
        next,
      ),
    ).rejects.toBeInstanceOf(TaskCancelledError);
  });

  it('only honors errors accepted by the handle predicate', async () => {
    const next = vi.fn().mockRejectedValue(new Error('do-not-retry'));
    const handle = vi.fn().mockReturnValue(false);

    await expect(
      behavior.handle(
        makeCtx(
          {
            retry: { maxAttempts: 5, backoff: { type: 'constant', delay: 0 } },
            handle,
          },
          { requestKind: 'query', requestName: 'GetThingQuery' },
        ),
        next,
      ),
    ).rejects.toThrow('do-not-retry');

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
        retry: {
          maxAttempts: 2,
          replaySafe: true,
          backoff: { type: 'constant', delay: 0 },
        },
        handleAllErrors: true,
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
    const ctx = makeCtx({ bulkhead: { limit: 2 } });
    const next = vi.fn().mockResolvedValue('ok');

    await behavior.handle(ctx, next);
    await behavior.handle(ctx, next);

    expect(ctx.getBehaviorOptions).toHaveBeenCalledTimes(1);
  });

  it('merges per-handler options over application defaults', async () => {
    const withDefaults = new ResilienceBehavior({
      retry: {
        maxAttempts: 5,
        replaySafe: true,
        backoff: { type: 'constant', delay: 0 },
      },
      handleAllErrors: true,
    });

    const next = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(
      withDefaults.handle(
        makeCtx({
          retry: {
            maxAttempts: 1,
            replaySafe: true,
            backoff: { type: 'constant', delay: 0 },
          },
        }),
        next,
      ),
    ).rejects.toThrow('boom');

    expect(next).toHaveBeenCalledTimes(2);
  });

  describe('configuration safety', () => {
    it('rejects a retry without an error classifier', async () => {
      await expect(
        behavior.handle(
          makeCtx(
            { retry: { maxAttempts: 1, replaySafe: true } },
            { requestKind: 'query', requestName: 'GetThingQuery' },
          ),
          vi.fn(),
        ),
      ).rejects.toBeInstanceOf(ResilienceConfigurationError);
    });

    it('rejects a circuit breaker or fallback, which belong to named policies', async () => {
      for (const options of [
        {
          circuitBreaker: {
            halfOpenAfter: 10,
            breaker: { type: 'consecutive', threshold: 1 },
          },
        },
        { fallback: { value: 'x' } },
      ]) {
        const next = vi.fn();
        await expect(
          behavior.handle(
            makeCtx(
              {
                ...options,
                handleAllErrors: true,
              } as ResilienceBehaviorOptions,
              { handlerType: class Other {} },
            ),
            next,
          ),
        ).rejects.toThrow('belong to a named policy of an outbound dependency');
        expect(next).not.toHaveBeenCalled();
      }
    });

    it('rejects command retry unless replay safety is explicitly acknowledged', async () => {
      await expect(
        behavior.handle(
          makeCtx({ retry: { maxAttempts: 2 }, handleAllErrors: true }),
          vi.fn(),
        ),
      ).rejects.toMatchObject({
        name: 'ResilienceConfigurationError',
        requestKind: 'command',
      });
    });

    it('allows query retry with a classifier without replaySafe', async () => {
      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce('ok');

      const result = await behavior.handle(
        makeCtx(
          {
            retry: { maxAttempts: 2, backoff: { type: 'constant', delay: 0 } },
            handle: (error) =>
              error instanceof Error && error.message === 'transient',
          },
          { requestKind: 'query', requestName: 'GetThingQuery' },
        ),
        next,
      );

      expect(result).toBe('ok');
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('allows command retry after replaySafe acknowledgement', async () => {
      const next = vi
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValueOnce('ok');

      const result = await behavior.handle(
        makeCtx({
          retry: {
            maxAttempts: 1,
            replaySafe: true,
            backoff: { type: 'constant', delay: 0 },
          },
          handleAllErrors: true,
        }),
        next,
      );

      expect(result).toBe('ok');
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('keeps timeout usable without an error classifier', async () => {
      const next = vi.fn(
        () => new Promise((resolve) => setTimeout(() => resolve('late'), 50)),
      );

      await expect(
        behavior.handle(
          makeCtx({
            timeout: { duration: 5, strategy: 'aggressive', replaySafe: true },
          }),
          next,
        ),
      ).rejects.toBeInstanceOf(TaskCancelledError);
    });
  });
});

/**
 * A policy is cached per handler; telemetry reports the request currently executing.
 */
describe('ResilienceBehavior telemetry labels across request types', () => {
  it('labels each retry with the request that triggered it', async () => {
    const retries: Array<string | undefined> = [];
    const handlerType = class MultiEventHandler {};

    const behavior = new ResilienceBehavior({
      handle: () => true,
      retry: {
        maxAttempts: 2,
        replaySafe: true,
        backoff: { type: 'constant', delay: 0 },
      },
      telemetry: {
        onRetry: (event) => retries.push(event.requestName),
      },
    });

    const run = async (requestName: string) => {
      let attempts = 0;
      await behavior
        .handle(
          {
            requestName,
            handlerName: 'MultiEventHandler',
            handlerType,
            requestKind: 'event',
            getBehaviorOptions: () => undefined,
          } as never,
          async () => {
            attempts += 1;
            if (attempts === 1) throw new Error('transient');
            return 'ok';
          },
        )
        .catch(() => undefined);
    };

    await run('OrderPlacedEvent');
    await run('OrderCancelledEvent');

    expect(retries).toEqual(['OrderPlacedEvent', 'OrderCancelledEvent']);
  });
});

describe('ResilienceBehavior PIPELINE_BEHAVIOR_CONTRACT', () => {
  const contract = (
    ResilienceBehavior as unknown as Record<symbol, IPipelineBehaviorContract>
  )[PIPELINE_BEHAVIOR_CONTRACT];

  it('returns diagnostic when a circuit breaker or fallback is configured on a handler', () => {
    const options = {
      circuitBreaker: {
        halfOpenAfter: 10,
        breaker: { type: 'consecutive', threshold: 1 },
      },
      handleAllErrors: true,
    };
    const diagnostics = contract?.validate?.({
      handlerType: class TestHandler {},
      handlerName: 'TestHandler',
      requestKind: 'query',
      declarationSource: 'handler',
      effectiveOptions: options,
      handlerOptions: options,
      globalOptions: undefined,
      effectiveBehaviorTypes: [ResilienceBehavior],
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics?.[0].message).toBe(
      'circuitBreaker and fallback are not applied around a whole handler; they belong to a named policy of an outbound dependency',
    );
    expect(diagnostics?.[0].fix).toContain(
      'ResilienceModule.forRoot({ policies',
    );
  });

  it('returns diagnostic when a retry lacks error classification', () => {
    const diagnostics = contract?.validate?.({
      handlerType: class TestHandler {},
      handlerName: 'TestHandler',
      requestKind: 'query',
      declarationSource: 'handler',
      effectiveOptions: { retry: { attempts: 2 } },
      handlerOptions: { retry: { attempts: 2 } },
      globalOptions: undefined,
      effectiveBehaviorTypes: [ResilienceBehavior],
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics?.[0].behaviorName).toBe('ResilienceBehavior');
    expect(diagnostics?.[0].message).toBe(
      'retry requires handle(error) or explicit handleAllErrors: true',
    );
    expect(diagnostics?.[0].fix).toContain('handleAllErrors: true');
  });

  it('returns diagnostic when retry on command/event lacks replaySafe: true', () => {
    const diagnostics = contract?.validate?.({
      handlerType: class TestHandler {},
      handlerName: 'TestHandler',
      requestKind: 'command',
      declarationSource: 'handler',
      effectiveOptions: { retry: { attempts: 2 }, handleAllErrors: true },
      handlerOptions: { retry: { attempts: 2 }, handleAllErrors: true },
      globalOptions: undefined,
      effectiveBehaviorTypes: [ResilienceBehavior],
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics?.[0].behaviorName).toBe('ResilienceBehavior');
    expect(diagnostics?.[0].message).toContain('retry.replaySafe: true');
    expect(diagnostics?.[0].fix).toContain('replaySafe: true');
  });

  it('returns multiple diagnostics when both error classification and replaySafe are missing', () => {
    const diagnostics = contract?.validate?.({
      handlerType: class TestHandler {},
      handlerName: 'TestHandler',
      requestKind: 'command',
      declarationSource: 'handler',
      effectiveOptions: { retry: { attempts: 2 } },
      handlerOptions: { retry: { attempts: 2 } },
      globalOptions: undefined,
      effectiveBehaviorTypes: [ResilienceBehavior],
    });

    expect(diagnostics).toHaveLength(2);
  });

  it.each([
    ['command', { duration: 100 }, 1],
    ['event', { duration: 100, strategy: 'aggressive' }, 1],
    ['command', { duration: 100, strategy: 'cooperative' }, 0],
    ['command', { duration: 100, replaySafe: true }, 0],
    ['query', { duration: 100 }, 0],
  ] as const)(
    'diagnoses an unacknowledged aggressive timeout on a %s handler (%o)',
    (requestKind, timeout, expected) => {
      const diagnostics = contract?.validate?.({
        handlerType: class TestHandler {},
        handlerName: 'TestHandler',
        requestKind,
        declarationSource: 'handler',
        effectiveOptions: { timeout },
        handlerOptions: { timeout },
        globalOptions: undefined,
        effectiveBehaviorTypes: [ResilienceBehavior],
      });

      expect(diagnostics ?? []).toHaveLength(expected);
      if (expected) {
        expect(diagnostics?.[0].message).toContain('aggressive timeout');
        expect(diagnostics?.[0].fix).toContain("strategy: 'cooperative'");
      }
    },
  );

  it('does not return diagnostic when query has proper error classification', () => {
    const diagnostics = contract?.validate?.({
      handlerType: class TestHandler {},
      handlerName: 'TestHandler',
      requestKind: 'query',
      declarationSource: 'handler',
      effectiveOptions: { retry: { attempts: 2 }, handleAllErrors: true },
      handlerOptions: { retry: { attempts: 2 }, handleAllErrors: true },
      globalOptions: undefined,
      effectiveBehaviorTypes: [ResilienceBehavior],
    });

    expect(diagnostics).toBeUndefined();
  });

  it('does not return diagnostic when command has replaySafe: true and handleAllErrors: true', () => {
    const diagnostics = contract?.validate?.({
      handlerType: class TestHandler {},
      handlerName: 'TestHandler',
      requestKind: 'command',
      declarationSource: 'handler',
      effectiveOptions: {
        retry: { attempts: 2, replaySafe: true },
        handleAllErrors: true,
      },
      handlerOptions: {
        retry: { attempts: 2, replaySafe: true },
        handleAllErrors: true,
      },
      globalOptions: undefined,
      effectiveBehaviorTypes: [ResilienceBehavior],
    });

    expect(diagnostics).toBeUndefined();
  });

  it('does not return diagnostic when custom policy object is supplied', () => {
    const diagnostics = contract?.validate?.({
      handlerType: class TestHandler {},
      handlerName: 'TestHandler',
      requestKind: 'command',
      declarationSource: 'handler',
      effectiveOptions: {
        policy: {} as never,
      },
      handlerOptions: {
        policy: {} as never,
      },
      globalOptions: undefined,
      effectiveBehaviorTypes: [ResilienceBehavior],
    });

    expect(diagnostics).toBeUndefined();
  });
});
