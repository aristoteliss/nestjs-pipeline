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

// ─── Mock the entire OTel API surface ────────────────────────────────────────
// We preserve real enum values (SpanStatusCode, SpanKind, …) via importOriginal
// and stub only the tracer-provider / tracer acquisition path.
vi.mock('@opentelemetry/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opentelemetry/api')>();
  return {
    ...actual,
    trace: {
      getTracerProvider: vi.fn(),
      getTracer: vi.fn(),
    },
  };
});

// ─── Span / Tracer doubles ────────────────────────────────────────────────────

const mockSpan = {
  setStatus: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

const mockTracer = {
  // Always invokes the callback synchronously so tests stay async-free.
  startActiveSpan: vi.fn((_name: string, _opts: any, cb: (span: any) => any) =>
    cb(mockSpan),
  ),
};

/**
 * Returns a TracerProvider mock that passes the isSdkInitialized() probe:
 * has getDelegate() → returns an object with getTracer.
 */
function initializedProvider() {
  return {
    getDelegate: () => ({ getTracer: () => mockTracer }),
  };
}

// ─── Context factory ──────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'test-corr-id',
    originalCorrelationId: 'test-corr-id',
    request: {},
    requestType: class TestRequest { },
    requestName: 'TestCommand',
    handlerType: class TestHandler { },
    handlerName: 'TestHandler',
    requestKind: 'command',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(undefined),
    ...overrides,
  } as unknown as IPipelineContext;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TraceBehavior', () => {
  let behavior: TraceBehavior;

  beforeEach(() => {
    behavior = new TraceBehavior();

    // Reset span & tracer mocks between tests.
    mockSpan.setStatus.mockReset();
    mockSpan.recordException.mockReset();
    mockSpan.end.mockReset();

    mockTracer.startActiveSpan.mockReset();
    mockTracer.startActiveSpan.mockImplementation(
      (_name: string, _opts: any, cb: (span: any) => any) => cb(mockSpan),
    );

    vi.mocked(trace.getTracer).mockReturnValue(mockTracer as any);
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('onModuleInit() — SDK detection via isSdkInitialized()', () => {
    it('sets sdkReady=false when provider has no getDelegate property', () => {
      vi.mocked(trace.getTracerProvider).mockReturnValue({} as any);

      behavior.onModuleInit();

      expect((behavior as any).sdkReady).toBe(false);
    });

    it('sets sdkReady=false when getDelegate exists but returns null', () => {
      vi.mocked(trace.getTracerProvider).mockReturnValue({
        getDelegate: () => null,
      } as any);

      behavior.onModuleInit();

      expect((behavior as any).sdkReady).toBe(false);
    });

    it('sets sdkReady=false when getDelegate returns an object without getTracer', () => {
      vi.mocked(trace.getTracerProvider).mockReturnValue({
        getDelegate: () => ({ getTracer: 'not-a-function' }),
      } as any);

      behavior.onModuleInit();

      expect((behavior as any).sdkReady).toBe(false);
    });

    it('sets sdkReady=true when provider has a delegate with getTracer function', () => {
      vi.mocked(trace.getTracerProvider).mockReturnValue(
        initializedProvider() as any,
      );

      behavior.onModuleInit();

      expect((behavior as any).sdkReady).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('handle() — SDK not initialized (pass-through mode)', () => {
    beforeEach(() => {
      vi.mocked(trace.getTracerProvider).mockReturnValue({} as any);
      behavior.onModuleInit(); // sdkReady = false
    });

    it('calls next() and returns its result without touching the tracer', async () => {
      const next = vi.fn().mockResolvedValue({ ok: true });

      const result = await behavior.handle(makeCtx(), next);

      expect(result).toEqual({ ok: true });
      expect(next).toHaveBeenCalledOnce();
      expect(trace.getTracer).not.toHaveBeenCalled();
      expect(mockTracer.startActiveSpan).not.toHaveBeenCalled();
    });

    it('propagates a rejection from next() without span side-effects', async () => {
      const next = vi.fn().mockRejectedValue(new Error('downstream failure'));

      await expect(behavior.handle(makeCtx(), next)).rejects.toThrow(
        'downstream failure',
      );

      expect(mockSpan.end).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('handle() — SDK initialized (tracing mode)', () => {
    beforeEach(() => {
      vi.mocked(trace.getTracerProvider).mockReturnValue(
        initializedProvider() as any,
      );
      behavior.onModuleInit(); // sdkReady = true
    });

    it('uses the default tracer name "nestjs-pipeline" when no options are provided', async () => {
      await behavior.handle(makeCtx(), vi.fn().mockResolvedValue(null));

      expect(trace.getTracer).toHaveBeenCalledWith('nestjs-pipeline');
    });

    it('uses the custom tracerName from getBehaviorOptions when provided', async () => {
      const ctx = makeCtx();
      vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
        tracerName: 'my-service',
      } as any);

      await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

      expect(trace.getTracer).toHaveBeenCalledWith('my-service');
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
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
      expect(mockSpan.end).toHaveBeenCalledOnce();
      expect(mockSpan.recordException).not.toHaveBeenCalled();
    });

    it('records exception, sets ERROR status, ends the span, and rethrows on failure', async () => {
      const error = new Error('handler exploded');
      const next = vi.fn().mockRejectedValue(error);

      await expect(behavior.handle(makeCtx(), next)).rejects.toThrow(
        'handler exploded',
      );

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: 'handler exploded',
      });
      expect(mockSpan.end).toHaveBeenCalledOnce();
    });

    it('always ends the span in the finally block (even on throw)', async () => {
      const next = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(behavior.handle(makeCtx(), next)).rejects.toThrow();

      // end() must be called exactly once regardless of the error path.
      expect(mockSpan.end).toHaveBeenCalledTimes(1);
    });

    it('handles an error without a message (err.message is empty string)', async () => {
      // new Error() sets .message to '' — the behavior passes err?.message as-is.
      const error = new Error();
      const next = vi.fn().mockRejectedValue(error);

      await expect(behavior.handle(makeCtx(), next)).rejects.toThrow();

      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.ERROR,
        message: '',
      });
    });

    it('works for event handlers (requestKind="event")', async () => {
      const ctx = makeCtx({
        requestKind: 'event',
        requestName: 'UserCreatedEvent',
      });
      const next = vi.fn().mockResolvedValue(undefined);

      await behavior.handle(ctx, next);

      expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
        'event.UserCreatedEvent',
        expect.anything(),
        expect.any(Function),
      );
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: SpanStatusCode.OK,
      });
    });
  });
});
