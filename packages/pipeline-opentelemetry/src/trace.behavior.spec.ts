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

import { IPipelineContext } from '@nestjs-pipeline/core';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TraceBehavior } from './trace.behavior';

vi.mock('@opentelemetry/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opentelemetry/api')>();
  return {
    ...actual,
    trace: {
      ...actual.trace,
      getTracer: vi.fn(),
    },
  };
});

const mockSpan = {
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

const mockTracer = {
  startActiveSpan: vi.fn(
    (_name: string, _opts: any, cb: (span: any) => any) => cb(mockSpan),
  ),
};

function makeCtx(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'test-corr-id',
    originalCorrelationId: 'test-corr-id',
    request: {},
    requestType: class TestRequest {},
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

describe('TraceBehavior', () => {
  let behavior: TraceBehavior;

  beforeEach(() => {
    behavior = new TraceBehavior();
    mockSpan.setStatus.mockReset();
    mockSpan.recordException.mockReset();
    mockSpan.end.mockReset();
    mockTracer.startActiveSpan.mockReset();
    mockTracer.startActiveSpan.mockImplementation(
      (_name: string, _opts: any, cb: (span: any) => any) => cb(mockSpan),
    );
    vi.mocked(trace.getTracer).mockReturnValue(mockTracer as any);
  });

  it('uses the default tracer name when no options are provided', async () => {
    await behavior.handle(makeCtx(), vi.fn().mockResolvedValue(null));
    expect(trace.getTracer).toHaveBeenCalledWith('nestjs-pipeline');
  });

  it('uses the custom tracerName from behavior options', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      tracerName: 'my-service',
    } as any);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));
    expect(trace.getTracer).toHaveBeenCalledWith('my-service');
  });

  it('bypasses all tracing calls when enabled is false', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({ enabled: false } as any);
    const next = vi.fn().mockResolvedValue('bypassed');

    await expect(behavior.handle(ctx, next)).resolves.toBe('bypassed');
    expect(trace.getTracer).not.toHaveBeenCalled();
    expect(mockTracer.startActiveSpan).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('creates a span named "{requestKind}.{requestName}"', async () => {
    const ctx = makeCtx({
      requestKind: 'query',
      requestName: 'GetUserQuery',
    });

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
      'query.GetUserQuery',
      expect.objectContaining({ kind: SpanKind.INTERNAL }),
      expect.any(Function),
    );
  });

  it('sets the correct pipeline attributes on the span', async () => {
    const startedAt = new Date('2026-03-01T10:00:00.000Z');
    const ctx = makeCtx({
      requestKind: 'command',
      requestName: 'CreateUserCommand',
      handlerName: 'CreateUserHandler',
      correlationId: 'corr-abc',
      startedAt,
    });

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    const [[, spanOpts]] = vi.mocked(mockTracer.startActiveSpan).mock.calls;
    expect(spanOpts.attributes).toMatchObject({
      'pipeline.request.kind': 'command',
      'pipeline.request.name': 'CreateUserCommand',
      'pipeline.handler.name': 'CreateUserHandler',
      'pipeline.correlation_id': 'corr-abc',
      'pipeline.started_at': startedAt.toISOString(),
    });
  });

  it('sets OK status, returns the result, and ends the span on success', async () => {
    const next = vi.fn().mockResolvedValue('result-value');

    const result = await behavior.handle(makeCtx(), next);

    expect(result).toBe('result-value');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(mockSpan.end).toHaveBeenCalledOnce();
    expect(mockSpan.recordException).not.toHaveBeenCalled();
  });

  it('records exception, sets ERROR status, ends the span, and rethrows on failure', async () => {
    const error = new Error('handler exploded');

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockRejectedValue(error)),
    ).rejects.toThrow('handler exploded');

    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'handler exploded',
    });
    expect(mockSpan.end).toHaveBeenCalledOnce();
  });

  it('always ends the span from the finally path', async () => {
    await expect(
      behavior.handle(
        makeCtx(),
        vi.fn().mockRejectedValue(new Error('fail')),
      ),
    ).rejects.toThrow('fail');

    expect(mockSpan.end).toHaveBeenCalledTimes(1);
  });

  it('preserves an empty Error message in span status', async () => {
    await expect(
      behavior.handle(makeCtx(), vi.fn().mockRejectedValue(new Error())),
    ).rejects.toThrow();

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: '',
    });
  });

  it('works for event handlers', async () => {
    const ctx = makeCtx({
      requestKind: 'event',
      requestName: 'UserCreatedEvent',
    });

    await behavior.handle(ctx, vi.fn().mockResolvedValue(undefined));

    expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
      'event.UserCreatedEvent',
      expect.objectContaining({
        kind: SpanKind.INTERNAL,
        attributes: expect.objectContaining({
          'pipeline.request.kind': 'event',
          'pipeline.request.name': 'UserCreatedEvent',
        }),
      }),
      expect.any(Function),
    );
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
  });
});
