/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { getResilienceAbortSignal } from './helpers/resilience-context';
import { ResilienceBehavior } from './resilience.behavior';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function makeCtx(): IPipelineContext {
  return {
    correlationId: 'corr',
    request: {},
    requestType: class TestRequest {},
    requestName: 'TestCommand',
    handlerType: class TestHandler {},
    handlerName: 'TestHandler',
    requestKind: 'command',
    startedAt: new Date(),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue({
      timeout: { duration: 5, strategy: 'cooperative' },
    }),
  } as unknown as IPipelineContext;
}

describe('ResilienceBehavior cooperative timeout', () => {
  it('makes Cockatiel abort signal available to code running inside the pipeline', async () => {
    const behavior = new ResilienceBehavior();
    const ctx = makeCtx();
    let observedSignal: AbortSignal | undefined;

    const result = await pipelineStore.run(ctx, () =>
      behavior.handle(ctx, async () => {
        observedSignal = getResilienceAbortSignal();
        expect(observedSignal).toBeInstanceOf(AbortSignal);

        await new Promise<void>((resolve) => {
          if (observedSignal?.aborted) return resolve();
          observedSignal?.addEventListener('abort', () => resolve(), {
            once: true,
          });
        });

        return 'stopped-cooperatively';
      }),
    );

    expect(observedSignal?.aborted).toBe(true);
    expect(result).toBe('stopped-cooperatively');
  });

  it('keeps the abort signal isolated to each overlapping timeout retry attempt', async () => {
    const behavior = new ResilienceBehavior();
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      retry: {
        maxAttempts: 1,
        replaySafe: true,
        backoff: { type: 'constant', delay: 0 },
      },
      handleAllErrors: true,
      timeout: { duration: 500, strategy: 'aggressive', replaySafe: true },
    });

    const releaseFirstAttempt = deferred();
    const firstAttemptObserved = deferred();
    let attempt = 0;
    let firstSignal: AbortSignal | undefined;
    let secondSignal: AbortSignal | undefined;
    let firstSignalAfterRetry: AbortSignal | undefined;

    const result = await pipelineStore.run(ctx, () =>
      behavior.handle(ctx, async () => {
        attempt += 1;

        if (attempt === 1) {
          firstSignal = getResilienceAbortSignal();
          await releaseFirstAttempt.promise;
          firstSignalAfterRetry = getResilienceAbortSignal();
          firstAttemptObserved.resolve();
          return 'late-first-result';
        }

        secondSignal = getResilienceAbortSignal();
        releaseFirstAttempt.resolve();
        await firstAttemptObserved.promise;
        expect(getResilienceAbortSignal()).toBe(secondSignal);
        return 'retry-result';
      }),
    );

    expect(result).toBe('retry-result');
    expect(attempt).toBe(2);
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).not.toBe(firstSignal);
    expect(secondSignal?.aborted).toBe(true);
    expect(firstSignalAfterRetry).toBe(firstSignal);
  });
});
