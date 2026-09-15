/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addPipelineTelemetryAttributes } from './telemetry-attributes';
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
  setAttribute: vi.fn(),
  setAttributes: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

const mockTracer = {
  startActiveSpan: vi.fn(
    (_name: string, _opts: unknown, cb: (span: typeof mockSpan) => unknown) =>
      cb(mockSpan),
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
    vi.mocked(trace.getTracer).mockReset();
    mockSpan.setStatus.mockReset();
    mockSpan.setAttribute.mockReset();
    mockSpan.setAttributes.mockReset();
    mockSpan.recordException.mockReset();
    mockSpan.end.mockReset();
    mockTracer.startActiveSpan.mockReset();
    mockTracer.startActiveSpan.mockImplementation(
      (_name: string, _opts: unknown, cb: (span: typeof mockSpan) => unknown) =>
        cb(mockSpan),
    );
    vi.mocked(trace.getTracer).mockReturnValue(mockTracer as never);
  });

  it('uses the default tracer name when no options are provided', async () => {
    await behavior.handle(makeCtx(), vi.fn().mockResolvedValue(null));
    expect(trace.getTracer).toHaveBeenCalledWith('nestjs-pipeline');
  });

  it('uses the custom tracerName from behavior options', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      tracerName: 'my-service',
    } as never);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));
    expect(trace.getTracer).toHaveBeenCalledWith('my-service');
  });

  it('bypasses all tracing calls when enabled is false', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      enabled: false,
    } as never);
    const next = vi.fn().mockResolvedValue('bypassed');

    await expect(behavior.handle(ctx, next)).resolves.toBe('bypassed');
    expect(trace.getTracer).not.toHaveBeenCalled();
    expect(mockTracer.startActiveSpan).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('creates a span named "{requestKind}.{requestName}" by default', async () => {
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

  it('sets the original pipeline attributes and optional tenant on the span', async () => {
    const startedAt = new Date('2026-03-01T10:00:00.000Z');
    const ctx = makeCtx({
      requestKind: 'command',
      requestName: 'CreateUserCommand',
      handlerName: 'CreateUserHandler',
      correlationId: 'corr-abc',
      tenantId: 'tenant-a',
      startedAt,
    });

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    const [[, spanOpts]] = mockTracer.startActiveSpan.mock.calls;
    expect(spanOpts).toEqual(
      expect.objectContaining({
        kind: SpanKind.INTERNAL,
        attributes: expect.objectContaining({
          'pipeline.request.kind': 'command',
          'pipeline.request.name': 'CreateUserCommand',
          'pipeline.handler.name': 'CreateUserHandler',
          'pipeline.correlation_id': 'corr-abc',
          'pipeline.tenant_id': 'tenant-a',
          'pipeline.started_at': startedAt.toISOString(),
        }),
      }),
    );
  });

  it('sets OK status, outcome, returns the result, and ends the span on success', async () => {
    const next = vi.fn().mockResolvedValue('result-value');

    const result = await behavior.handle(makeCtx(), next);

    expect(result).toBe('result-value');
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      'pipeline.outcome',
      'success',
    );
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.OK,
    });
    expect(mockSpan.end).toHaveBeenCalledOnce();
    expect(mockSpan.recordException).not.toHaveBeenCalled();
  });

  it('records exception, outcome/error type, sets ERROR status, ends, and rethrows', async () => {
    const error = new Error('handler exploded');

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockRejectedValue(error)),
    ).rejects.toBe(error);

    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
    expect(mockSpan.setAttribute).toHaveBeenCalledWith(
      'pipeline.outcome',
      'failure',
    );
    expect(mockSpan.setAttribute).toHaveBeenCalledWith('error.type', 'Error');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'handler exploded',
    });
    expect(mockSpan.end).toHaveBeenCalledOnce();
  });

  it('always ends the span from the finally path', async () => {
    await expect(
      behavior.handle(makeCtx(), vi.fn().mockRejectedValue(new Error('fail'))),
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
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.OK,
    });
  });

  it('supports a custom static span name', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      spanName: 'application.checkout',
    } as never);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
      'application.checkout',
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('supports a request-aware span-name factory', async () => {
    const ctx = makeCtx({ requestName: 'CheckoutCommand' });
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      spanName: (pipelineContext: IPipelineContext) =>
        `application.${pipelineContext.requestName}`,
    } as never);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
      'application.CheckoutCommand',
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('falls back to the default name if a span-name factory throws', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      spanName: () => {
        throw new Error('bad name');
      },
    } as never);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(mockTracer.startActiveSpan).toHaveBeenCalledWith(
      'command.TestCommand',
      expect.any(Object),
      expect.any(Function),
    );
  });

  it('merges custom span attributes', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      attributeFactory: () => ({ 'app.region': 'eu-west' }),
    } as never);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    const [[, spanOpts]] = mockTracer.startActiveSpan.mock.calls;
    expect(spanOpts).toEqual(
      expect.objectContaining({
        attributes: expect.objectContaining({ 'app.region': 'eu-west' }),
      }),
    );
  });

  it('ignores attribute-enrichment failures', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      attributeFactory: () => {
        throw new Error('enricher failed');
      },
    } as never);

    await expect(
      behavior.handle(ctx, vi.fn().mockResolvedValue('ok')),
    ).resolves.toBe('ok');
  });

  it('captures attributes added by downstream behaviors or the handler', async () => {
    const ctx = makeCtx();
    const next = vi.fn().mockImplementation(() => {
      addPipelineTelemetryAttributes(ctx, {
        'pipeline.cache.hit': true,
        'pipeline.feature.variant': 'treatment',
      });
      return Promise.resolve('ok');
    });

    await behavior.handle(ctx, next);

    expect(mockSpan.setAttributes).toHaveBeenCalledWith({
      'pipeline.cache.hit': true,
      'pipeline.feature.variant': 'treatment',
    });
  });

  it('can skip request-local context attributes', async () => {
    const ctx = makeCtx();
    addPipelineTelemetryAttributes(ctx, { 'user.id': 'user-123' });
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      includeContextAttributes: false,
    } as never);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    const [[, spanOpts]] = mockTracer.startActiveSpan.mock.calls;
    expect(spanOpts).toEqual(
      expect.objectContaining({
        attributes: expect.not.objectContaining({ 'user.id': 'user-123' }),
      }),
    );
    expect(mockSpan.setAttributes).not.toHaveBeenCalled();
  });

  it('can disable exception events while preserving ERROR status', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      recordException: false,
    } as never);
    const error = new Error('boom');

    await expect(
      behavior.handle(ctx, vi.fn().mockRejectedValue(error)),
    ).rejects.toBe(error);

    expect(mockSpan.recordException).not.toHaveBeenCalled();
    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'boom',
    });
  });
});
