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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEAD_LETTER_ITEM, DeadLetterBehavior } from './dead-letter.behavior';
import type { DeadLetterBehaviorOptions } from './interfaces/dead-letter-options.interface';
import type {
  DeadLetterRecord,
  DeadLetterTransport,
} from './interfaces/dead-letter-transport.interface';

// ─── Doubles ──────────────────────────────────────────────────────────────────

const send = vi.fn();
const transport: DeadLetterTransport = { send };

function makeCtx(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'corr-123',
    originalCorrelationId: 'corr-123',
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

// ─── Tests ────────────────────────────────────────────────────────────────────

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
      expect.stringContaining('Dead-lettered command TestCommand'),
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
      requestKind: 'command',
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

  it('merges module defaults under per-handler options (handler wins)', async () => {
    const behavior = new DeadLetterBehavior(transport, { rethrow: false });
    // Handler overrides rethrow back to true.
    const ctx = withOptions(makeCtx(), { rethrow: true });

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(new Error('x'))),
    ).rejects.toThrow('x');
    expect(send).toHaveBeenCalledTimes(1);
  });
});
