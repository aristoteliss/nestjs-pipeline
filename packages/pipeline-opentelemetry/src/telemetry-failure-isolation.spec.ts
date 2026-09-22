/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { metrics, trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricsBehavior } from './metrics.behavior';
import { TraceBehavior } from './trace.behavior';

function makeContext(): IPipelineContext {
  return {
    correlationId: 'corr-1',
    request: { id: 1 },
    requestType: class GetUserQuery {},
    requestName: 'GetUserQuery',
    handlerType: class GetUserHandler {},
    handlerName: 'GetUserHandler',
    requestKind: 'query',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: () => undefined,
  } as unknown as IPipelineContext;
}

/** Installs a tracer whose span fails at the named step. */
function withFailingSpan(failing: string) {
  const boom = new Error(`span ${failing} failure`);
  const span = {
    setAttributes: vi.fn(),
    setAttribute: vi.fn(),
    setStatus: vi.fn(),
    recordException: vi.fn(),
    end: vi.fn(),
  };
  (span as unknown as Record<string, () => never>)[failing] = () => {
    throw boom;
  };

  vi.spyOn(trace, 'getTracer').mockReturnValue({
    startActiveSpan: ((_name: unknown, _opts: unknown, fn: unknown) =>
      (fn as (s: unknown) => unknown)(span)) as never,
  } as never);

  return { span, boom };
}

describe('TraceBehavior failure isolation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['end', 'setAttributes', 'setAttribute', 'setStatus'])(
    'returns the business result when span.%s() throws on the success path',
    async (failing) => {
      withFailingSpan(failing);
      const behavior = new TraceBehavior();
      const next = vi.fn().mockResolvedValue({ ok: true });

      await expect(behavior.handle(makeContext(), next)).resolves.toEqual({
        ok: true,
      });
      expect(next).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['end', 'setAttributes', 'recordException', 'setStatus'])(
    'preserves the business error when span.%s() throws on the failure path',
    async (failing) => {
      withFailingSpan(failing);
      const behavior = new TraceBehavior();
      const businessError = new Error('business failure');
      const next = vi.fn().mockRejectedValue(businessError);

      await expect(behavior.handle(makeContext(), next)).rejects.toBe(
        businessError,
      );
      expect(next).toHaveBeenCalledTimes(1);
    },
  );

  it('preserves a thrown non-Error value by identity', async () => {
    withFailingSpan('end');
    const behavior = new TraceBehavior();
    const thrown = { code: 'NOT_AN_ERROR' };

    await expect(
      behavior.handle(makeContext(), vi.fn().mockRejectedValue(thrown)),
    ).rejects.toBe(thrown);
  });

  it('runs the handler untraced when the tracer cannot be acquired', async () => {
    vi.spyOn(trace, 'getTracer').mockImplementation(() => {
      throw new Error('no provider');
    });
    const behavior = new TraceBehavior();
    const next = vi.fn().mockResolvedValue('value');

    await expect(behavior.handle(makeContext(), next)).resolves.toBe('value');
    expect(next).toHaveBeenCalledTimes(1);
  });

  function tracerFailingAfterCallback() {
    vi.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: ((_n: unknown, _o: unknown, fn: unknown) => {
        (fn as (s: unknown) => Promise<unknown>)({
          setAttributes: vi.fn(),
          setAttribute: vi.fn(),
          setStatus: vi.fn(),
          recordException: vi.fn(),
          end: vi.fn(),
        });
        throw new Error('span machinery failure');
      }) as never,
    } as never);
  }

  it('returns the handler result once when startActiveSpan fails after invoking it', async () => {
    tracerFailingAfterCallback();
    const next = vi.fn().mockResolvedValue('committed');

    await expect(new TraceBehavior().handle(makeContext(), next)).resolves.toBe(
      'committed',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not retry a handler that throws synchronously', async () => {
    withFailingSpan('end');
    const businessError = new Error('synchronous business failure');
    const next = vi.fn(() => {
      throw businessError;
    });

    await expect(new TraceBehavior().handle(makeContext(), next)).rejects.toBe(
      businessError,
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('keeps the business error when startActiveSpan fails after invoking it', async () => {
    tracerFailingAfterCallback();
    const businessError = new Error('business failure');
    const next = vi.fn().mockRejectedValue(businessError);

    await expect(new TraceBehavior().handle(makeContext(), next)).rejects.toBe(
      businessError,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('runs untraced when startActiveSpan throws before invoking the callback', async () => {
    const next = vi.fn().mockResolvedValue('value');
    vi.spyOn(trace, 'getTracer').mockReturnValue({
      startActiveSpan: vi.fn().mockImplementation(() => {
        throw new Error('startActiveSpan synchronous failure');
      }),
    } as never);

    const behavior = new TraceBehavior();
    const result = await behavior.handle(makeContext(), next);
    expect(result).toBe('value');
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('MetricsBehavior failure isolation', () => {
  let behavior: MetricsBehavior;

  beforeEach(() => {
    // A logger that throws on every level — the metrics catch blocks call it
    // precisely when instrumentation has already failed.
    const throwingLogger = {
      warn: () => {
        throw new Error('logger failure');
      },
      debug: () => {
        throw new Error('logger failure');
      },
      log: () => {
        throw new Error('logger failure');
      },
      error: () => {
        throw new Error('logger failure');
      },
    };
    behavior = new MetricsBehavior(throwingLogger as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the business result when instrument creation and the logger both fail', async () => {
    // Both halves matter: the meter throws, and the warn() that reports it
    // throws too. Only the second is new — the first was already handled.
    vi.spyOn(metrics, 'getMeter').mockImplementation(() => {
      throw new Error('meter failure');
    });
    const next = vi.fn().mockResolvedValue('value');

    await expect(behavior.handle(makeContext(), next)).resolves.toBe('value');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('preserves the business error when recording and the diagnostic logger both fail', async () => {
    vi.spyOn(metrics, 'getMeter').mockReturnValue({
      createHistogram: () => ({
        record: () => {
          throw new Error('record failure');
        },
      }),
      createCounter: () => ({
        add: () => {
          throw new Error('add failure');
        },
      }),
      createUpDownCounter: () => ({
        add: () => {
          throw new Error('add failure');
        },
      }),
    } as never);

    const businessError = new Error('business failure');
    const next = vi.fn().mockRejectedValue(businessError);

    await expect(behavior.handle(makeContext(), next)).rejects.toBe(
      businessError,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns the business result when recording and the diagnostic logger both fail', async () => {
    vi.spyOn(metrics, 'getMeter').mockReturnValue({
      createHistogram: () => ({
        record: () => {
          throw new Error('record failure');
        },
      }),
      createCounter: () => ({
        add: () => {
          throw new Error('add failure');
        },
      }),
      createUpDownCounter: () => ({
        add: () => {
          throw new Error('add failure');
        },
      }),
    } as never);

    const next = vi.fn().mockResolvedValue('value');

    await expect(behavior.handle(makeContext(), next)).resolves.toBe('value');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles non-Error thrown during instrument creation', async () => {
    vi.spyOn(metrics, 'getMeter').mockImplementation(() => {
      throw 'meter string error';
    });
    const next = vi.fn().mockResolvedValue('value');

    await expect(behavior.handle(makeContext(), next)).resolves.toBe('value');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('handles non-Error thrown by downstream handler and logs string instrument failure', async () => {
    const debugLog = vi.fn();
    const workingLogger = {
      debug: debugLog,
      warn: vi.fn(),
      log: vi.fn(),
      error: vi.fn(),
    };
    const loggingBehavior = new MetricsBehavior(workingLogger as never);

    vi.spyOn(metrics, 'getMeter').mockReturnValue({
      createHistogram: () => ({
        record: () => {
          throw 'record string error';
        },
      }),
      createCounter: () => ({
        add: () => {
          throw 'counter add string error';
        },
      }),
      createUpDownCounter: () => ({
        add: () => {
          throw 'updown add string error';
        },
      }),
    } as never);

    const next = vi.fn().mockRejectedValue('business string error');

    await expect(loggingBehavior.handle(makeContext(), next)).rejects.toBe(
      'business string error',
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(debugLog).toHaveBeenCalledWith(
      expect.stringContaining('record string error'),
      MetricsBehavior.name,
    );
    expect(debugLog).toHaveBeenCalledWith(
      expect.stringContaining('updown add string error'),
      MetricsBehavior.name,
    );
  });
});
