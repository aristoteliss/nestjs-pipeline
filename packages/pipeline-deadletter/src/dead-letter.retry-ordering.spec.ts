/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { describe, expect, it, vi } from 'vitest';
import { DeadLetterBehavior } from './dead-letter.behavior';
import type { DeadLetterTransport } from './interfaces/dead-letter-transport.interface';

function context(): IPipelineContext {
  return {
    correlationId: 'corr-1',
    request: { id: 1 },
    requestType: class TestCommand {},
    requestName: 'TestCommand',
    handlerType: class TestHandler {},
    handlerName: 'TestHandler',
    requestKind: 'command',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(undefined),
  } as unknown as IPipelineContext;
}

function transport(): DeadLetterTransport & { send: ReturnType<typeof vi.fn> } {
  return {
    send: vi.fn().mockResolvedValue(undefined),
  } as unknown as DeadLetterTransport & {
    send: ReturnType<typeof vi.fn>;
  };
}

describe('DeadLetterBehavior retry ordering', () => {
  it('dead-letters once when retries happen downstream and are exhausted', async () => {
    const sink = transport();
    const behavior = new DeadLetterBehavior(sink);
    let attempts = 0;

    const retryingNext = async (): Promise<never> => {
      let lastError: Error | undefined;
      while (attempts < 3) {
        attempts += 1;
        try {
          throw new Error(`attempt-${attempts}`);
        } catch (error) {
          lastError = error as Error;
        }
      }
      throw lastError;
    };

    await expect(behavior.handle(context(), retryingNext)).rejects.toThrow(
      'attempt-3',
    );

    expect(attempts).toBe(3);
    expect(sink.send).toHaveBeenCalledTimes(1);
  });

  it('captures every attempt when placed inside a retry loop', async () => {
    const sink = transport();
    const behavior = new DeadLetterBehavior(sink);
    const ctx = context();

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await expect(
        behavior.handle(ctx, async () => {
          throw new Error(`attempt-${attempt}`);
        }),
      ).rejects.toThrow(`attempt-${attempt}`);
    }

    expect(sink.send).toHaveBeenCalledTimes(3);
  });
});
