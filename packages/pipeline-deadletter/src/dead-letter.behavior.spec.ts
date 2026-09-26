/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IPipelineBehaviorContract,
  type IPipelineContext,
  PIPELINE_BEHAVIOR_CONTRACT,
} from '@nestjs-pipeline/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEAD_LETTER_ITEM, DeadLetterBehavior } from './dead-letter.behavior';
import type { DeadLetterBehaviorOptions } from './interfaces/dead-letter-options.interface';
import type {
  DeadLetterRecord,
  DeadLetterTransport,
} from './interfaces/dead-letter-transport.interface';

const send = vi.fn();
const transport: DeadLetterTransport = { send };

function makeCtx(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'corr-123',
    request: { id: 1 },
    requestType: class TestCommand {},
    requestName: 'TestCommand',
    handlerType: class TestHandler {},
    handlerName: 'TestHandler',
    requestKind: 'event',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as unknown as IPipelineContext;
}

function withOptions(
  ctx: IPipelineContext,
  options: DeadLetterBehaviorOptions,
): IPipelineContext {
  vi.mocked(ctx.getBehaviorOptions).mockReturnValue(
    options as unknown as ReturnType<IPipelineContext['getBehaviorOptions']>,
  );
  return ctx;
}

describe('DeadLetterBehavior', () => {
  beforeEach(() => {
    send.mockReset();
  });

  it('does not mutate a shared logger and supplies its context per call', async () => {
    const logger = {
      warn: vi.fn(),
      error: vi.fn(),
      setContext: vi.fn(),
    };
    const behavior = new DeadLetterBehavior(
      transport,
      undefined,
      logger as never,
    );

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockRejectedValue(new Error('boom'))),
    ).rejects.toThrow('boom');

    expect(logger.setContext).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Dead-lettered event TestCommand'),
      DeadLetterBehavior.name,
    );
  });

  it('passes through and never touches the transport on success', async () => {
    const behavior = new DeadLetterBehavior(transport);
    const next = vi.fn().mockResolvedValue('ok');

    const result = await behavior.handle(makeCtx(), next);

    expect(result).toBe('ok');
    expect(send).not.toHaveBeenCalled();
  });

  it('captures a record then re-throws by default', async () => {
    const behavior = new DeadLetterBehavior(transport);
    const ctx = makeCtx();
    const boom = new TypeError('boom');

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(boom)),
    ).rejects.toBe(boom);

    expect(send).toHaveBeenCalledTimes(1);
    const record = send.mock.calls[0][0] as DeadLetterRecord;
    expect(record).toMatchObject({
      correlationId: 'corr-123',
      requestKind: 'event',
      requestName: 'TestCommand',
      handlerName: 'TestHandler',
      payload: { id: 1 },
      error: { name: 'TypeError', message: 'boom' },
    });
    expect(record.error.stack).toBeTypeOf('string');
    expect(record.failedAt).toBeTypeOf('string');
    expect(ctx.items.get(DEAD_LETTER_ITEM)).toBe(true);
  });

  it('swallows the error and resolves to undefined when rethrow=false', async () => {
    const behavior = new DeadLetterBehavior(transport);
    const ctx = withOptions(makeCtx({ requestKind: 'event' }), {
      rethrow: false,
    });

    const result = await behavior.handle(
      ctx,
      vi.fn().mockRejectedValue(new Error('event handler failed')),
    );

    expect(result).toBeUndefined();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('omits the stack when includeStack=false', async () => {
    const behavior = new DeadLetterBehavior(transport);
    const ctx = withOptions(makeCtx(), { includeStack: false });

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(new Error('x'))),
    ).rejects.toThrow('x');

    const record = send.mock.calls[0][0] as DeadLetterRecord;
    expect(record.error.stack).toBeUndefined();
  });

  it('normalizes non-Error throws', async () => {
    const behavior = new DeadLetterBehavior(transport);

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockRejectedValue('string failure')),
    ).rejects.toBe('string failure');

    const record = send.mock.calls[0][0] as DeadLetterRecord;
    expect(record.error).toEqual({
      name: 'unknown',
      message: 'string failure',
      stack: undefined,
    });
  });

  it('only captures the configured request kinds', async () => {
    const behavior = new DeadLetterBehavior(transport);
    const ctx = withOptions(makeCtx({ requestKind: 'query' }), {
      captureKinds: ['command', 'event'],
    });

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(new Error('nope'))),
    ).rejects.toThrow('nope');

    expect(send).not.toHaveBeenCalled();
    expect(ctx.items.get(DEAD_LETTER_ITEM)).toBeUndefined();
  });

  it('does not swallow an excluded request kind when rethrow=false', async () => {
    const behavior = new DeadLetterBehavior(transport);
    const ctx = withOptions(makeCtx({ requestKind: 'query' }), {
      captureKinds: ['event'],
      rethrow: false,
    });

    await expect(
      behavior.handle(
        ctx,
        vi.fn().mockRejectedValue(new Error('not captured')),
      ),
    ).rejects.toThrow('not captured');

    expect(send).not.toHaveBeenCalled();
    expect(ctx.items.get(DEAD_LETTER_ITEM)).toBeUndefined();
  });

  it('skips capture when error matches ignoreErrors class array', async () => {
    class CustomValidationError extends Error {}
    const behavior = new DeadLetterBehavior(transport);
    const ctx = withOptions(makeCtx(), {
      ignoreErrors: [CustomValidationError],
    });

    await expect(
      behavior.handle(
        ctx,
        vi.fn().mockRejectedValue(new CustomValidationError('invalid')),
      ),
    ).rejects.toThrow('invalid');

    expect(send).not.toHaveBeenCalled();
    expect(ctx.items.get(DEAD_LETTER_ITEM)).toBeUndefined();
  });

  it('captures error when ignoreErrors class array does not match', async () => {
    class CustomValidationError extends Error {}
    const behavior = new DeadLetterBehavior(transport);
    const ctx = withOptions(makeCtx(), {
      ignoreErrors: [CustomValidationError],
    });

    await expect(
      behavior.handle(
        ctx,
        vi.fn().mockRejectedValue(new Error('system crash')),
      ),
    ).rejects.toThrow('system crash');

    expect(send).toHaveBeenCalledTimes(1);
    expect(ctx.items.get(DEAD_LETTER_ITEM)).toBe(true);
  });

  it('skips capture when error matches ignoreErrors predicate', async () => {
    const behavior = new DeadLetterBehavior(transport);
    const ctx = withOptions(makeCtx(), {
      ignoreErrors: (err) =>
        err instanceof Error && err.message.startsWith('VALIDATION:'),
    });

    await expect(
      behavior.handle(
        ctx,
        vi.fn().mockRejectedValue(new Error('VALIDATION: bad input')),
      ),
    ).rejects.toThrow('VALIDATION: bad input');

    expect(send).not.toHaveBeenCalled();
    expect(ctx.items.get(DEAD_LETTER_ITEM)).toBeUndefined();
  });

  it('does not swallow an ignored error when rethrow=false', async () => {
    class IgnoredError extends Error {}
    const behavior = new DeadLetterBehavior(transport);
    const ctx = withOptions(makeCtx(), {
      ignoreErrors: [IgnoredError],
      rethrow: false,
    });

    await expect(
      behavior.handle(
        ctx,
        vi.fn().mockRejectedValue(new IgnoredError('skip me')),
      ),
    ).rejects.toThrow('skip me');

    expect(send).not.toHaveBeenCalled();
    expect(ctx.items.get(DEAD_LETTER_ITEM)).toBeUndefined();
  });

  it('attaches metadata from the factory', async () => {
    const behavior = new DeadLetterBehavior(transport);
    const ctx = withOptions(makeCtx(), {
      metadata: (c) => ({ tenant: 'acme', name: c.requestName }),
    });

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(new Error('x'))),
    ).rejects.toThrow('x');

    const record = send.mock.calls[0][0] as DeadLetterRecord;
    expect(record.metadata).toEqual({ tenant: 'acme', name: 'TestCommand' });
  });

  it('never masks the original error when the transport itself fails', async () => {
    send.mockRejectedValue(new Error('sink down'));
    const behavior = new DeadLetterBehavior(transport);
    const original = new Error('original');

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockRejectedValue(original)),
    ).rejects.toBe(original);
  });

  it('logs a non-Error transport rejection verbatim and still rethrows the original error', async () => {
    send.mockRejectedValue('queue unreachable');
    const logger = { warn: vi.fn(), error: vi.fn() };
    const behavior = new DeadLetterBehavior(
      transport,
      undefined,
      logger as never,
    );
    const original = new Error('original');

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockRejectedValue(original)),
    ).rejects.toBe(original);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to dead-letter TestCommand: queue unreachable',
      DeadLetterBehavior.name,
    );
  });

  it('rethrows the original error when delivery fails despite rethrow=false', async () => {
    send.mockRejectedValue(new Error('sink down'));
    const behavior = new DeadLetterBehavior(transport);
    const original = new Error('original');
    const ctx = withOptions(makeCtx(), { rethrow: false });

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(original)),
    ).rejects.toBe(original);
    expect(ctx.items.get(DEAD_LETTER_ITEM)).toBe(false);
  });

  it('merges module defaults under per-handler options (handler wins)', async () => {
    const behavior = new DeadLetterBehavior(transport, { rethrow: false });
    const ctx = withOptions(makeCtx(), { rethrow: true });

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(new Error('x'))),
    ).rejects.toThrow('x');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('redacts sensitive fields in captured payload using options.redactKeys', async () => {
    const behavior = new DeadLetterBehavior(transport, {
      redactKeys: ['code'],
    });
    const ctx = makeCtx({
      request: { email: 'alice@test.io', code: '123456', password: 'plain' },
    });

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(new Error('crash'))),
    ).rejects.toThrow('crash');

    expect(send).toHaveBeenCalledTimes(1);
    const captured = send.mock.calls[0][0] as DeadLetterRecord;
    expect(captured.payload).toEqual({
      email: 'alice@test.io',
      code: '[REDACTED]',
      password: '[REDACTED]',
    });
  });

  it('merges module default ignoreErrors with handler ignoreErrors arrays', async () => {
    class DefaultIgnoredError extends Error {}
    class HandlerIgnoredError extends Error {}
    class OtherError extends Error {}

    const behavior = new DeadLetterBehavior(transport, {
      ignoreErrors: [DefaultIgnoredError],
    });

    const ctx = withOptions(makeCtx(), {
      ignoreErrors: [HandlerIgnoredError],
    });

    // 1. DefaultIgnoredError must still be ignored
    await expect(
      behavior.handle(
        ctx,
        vi.fn().mockRejectedValue(new DefaultIgnoredError('skip default')),
      ),
    ).rejects.toThrow('skip default');
    expect(send).not.toHaveBeenCalled();

    // 2. HandlerIgnoredError must also be ignored
    await expect(
      behavior.handle(
        ctx,
        vi.fn().mockRejectedValue(new HandlerIgnoredError('skip handler')),
      ),
    ).rejects.toThrow('skip handler');
    expect(send).not.toHaveBeenCalled();

    // 3. OtherError must NOT be ignored
    await expect(
      behavior.handle(
        ctx,
        vi.fn().mockRejectedValue(new OtherError('capture me')),
      ),
    ).rejects.toThrow('capture me');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('merges module default redactKeys with handler redactKeys', async () => {
    const behavior = new DeadLetterBehavior(transport, {
      redactKeys: ['secretKey'],
    });
    const ctx = withOptions(
      makeCtx({
        request: {
          secretKey: 'top-secret',
          pin: '1234',
          publicField: 'visible',
        },
      }),
      {
        redactKeys: ['pin'],
      },
    );

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(new Error('crash'))),
    ).rejects.toThrow('crash');

    expect(send).toHaveBeenCalledTimes(1);
    const captured = send.mock.calls[0][0] as DeadLetterRecord;
    expect(captured.payload).toEqual({
      secretKey: '[REDACTED]',
      pin: '[REDACTED]',
      publicField: 'visible',
    });
  });

  describe('ignoreErrors merge combinations', () => {
    class ErrorA extends Error {}
    class ErrorB extends Error {}
    class ErrorC extends Error {}

    it('merges when both defaults and handler use filter functions', async () => {
      const behavior = new DeadLetterBehavior(transport, {
        ignoreErrors: (err) => err instanceof ErrorA,
      });
      const ctx = withOptions(makeCtx(), {
        ignoreErrors: (err) => err instanceof ErrorB,
      });

      // ErrorA ignored by default filter
      await expect(
        behavior.handle(ctx, vi.fn().mockRejectedValue(new ErrorA('a'))),
      ).rejects.toThrow('a');
      expect(send).not.toHaveBeenCalled();

      // ErrorB ignored by handler filter
      await expect(
        behavior.handle(ctx, vi.fn().mockRejectedValue(new ErrorB('b'))),
      ).rejects.toThrow('b');
      expect(send).not.toHaveBeenCalled();

      // ErrorC captured
      await expect(
        behavior.handle(ctx, vi.fn().mockRejectedValue(new ErrorC('c'))),
      ).rejects.toThrow('c');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('merges when defaults is an array and handler is a filter function', async () => {
      const behavior = new DeadLetterBehavior(transport, {
        ignoreErrors: [ErrorA],
      });
      const ctx = withOptions(makeCtx(), {
        ignoreErrors: (err) => err instanceof ErrorB,
      });

      // ErrorA ignored via default array
      await expect(
        behavior.handle(ctx, vi.fn().mockRejectedValue(new ErrorA('a'))),
      ).rejects.toThrow('a');
      expect(send).not.toHaveBeenCalled();

      // ErrorB ignored via handler filter
      await expect(
        behavior.handle(ctx, vi.fn().mockRejectedValue(new ErrorB('b'))),
      ).rejects.toThrow('b');
      expect(send).not.toHaveBeenCalled();

      // ErrorC captured
      await expect(
        behavior.handle(ctx, vi.fn().mockRejectedValue(new ErrorC('c'))),
      ).rejects.toThrow('c');
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('merges when defaults is a filter function and handler is an array', async () => {
      const behavior = new DeadLetterBehavior(transport, {
        ignoreErrors: (err) => err instanceof ErrorA,
      });
      const ctx = withOptions(makeCtx(), {
        ignoreErrors: [ErrorB],
      });

      // ErrorA ignored via default filter
      await expect(
        behavior.handle(ctx, vi.fn().mockRejectedValue(new ErrorA('a'))),
      ).rejects.toThrow('a');
      expect(send).not.toHaveBeenCalled();

      // ErrorB ignored via handler array
      await expect(
        behavior.handle(ctx, vi.fn().mockRejectedValue(new ErrorB('b'))),
      ).rejects.toThrow('b');
      expect(send).not.toHaveBeenCalled();

      // ErrorC captured
      await expect(
        behavior.handle(ctx, vi.fn().mockRejectedValue(new ErrorC('c'))),
      ).rejects.toThrow('c');
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  it('captures only events when captureKinds is omitted', async () => {
    const behavior = new DeadLetterBehavior(transport);

    for (const requestKind of ['command', 'query'] as const) {
      await expect(
        behavior.handle(
          makeCtx({ requestKind }),
          vi.fn().mockRejectedValue(new Error('caller sees it')),
        ),
      ).rejects.toThrow('caller sees it');
    }
    expect(send).not.toHaveBeenCalled();
  });

  it('never swallows a captured command error, even with rethrow=false', async () => {
    const behavior = new DeadLetterBehavior(transport);
    const ctx = withOptions(makeCtx({ requestKind: 'command' }), {
      captureKinds: ['command'],
      rethrow: false,
    });

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(new Error('failed'))),
    ).rejects.toThrow('failed');
    expect(send).toHaveBeenCalledOnce();
  });

  it('logs a swallowed event at error level with the record id', async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const behavior = new DeadLetterBehavior(
      transport,
      undefined,
      logger as never,
    );

    await behavior.handle(
      withOptions(makeCtx(), { rethrow: false }),
      vi.fn().mockRejectedValue(new Error('failed')),
    );

    const record = send.mock.calls[0]?.[0] as DeadLetterRecord;
    expect(logger.error).toHaveBeenCalledWith(
      `Dead-lettered and swallowed TestCommand (correlationId: corr-123, deadLetterId: ${record.id})`,
      DeadLetterBehavior.name,
    );
  });

  describe('PIPELINE_BEHAVIOR_CONTRACT', () => {
    const contract = (
      DeadLetterBehavior as unknown as Record<symbol, IPipelineBehaviorContract>
    )[PIPELINE_BEHAVIOR_CONTRACT];
    const validate = (
      requestKind: 'command' | 'query' | 'event',
      effectiveOptions: DeadLetterBehaviorOptions | undefined,
    ) =>
      contract?.validate?.({
        handlerType: class TestHandler {},
        handlerName: 'TestHandler',
        requestKind,
        declarationSource: 'handler',
        effectiveOptions: effectiveOptions as
          | Record<string, unknown>
          | undefined,
        handlerOptions: effectiveOptions as Record<string, unknown> | undefined,
        globalOptions: undefined,
        effectiveBehaviorTypes: [DeadLetterBehavior],
      });

    it('rejects rethrow: false on a command or query handler', () => {
      for (const requestKind of ['command', 'query'] as const) {
        const diagnostics = validate(requestKind, { rethrow: false });
        expect(diagnostics).toHaveLength(1);
        expect(diagnostics?.[0].message).toBe(
          `rethrow: false on a ${requestKind} handler would answer its caller with undefined instead of the error`,
        );
      }
    });

    it('accepts rethrow: false on an event handler, and any handler without it', () => {
      expect(validate('event', { rethrow: false })).toBeUndefined();
      expect(validate('command', {})).toBeUndefined();
      expect(validate('command', undefined)).toBeUndefined();
    });
  });
});
