import type { IPipelineContext } from '@nestjs-pipeline/core';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TraceBehavior } from './trace.behavior';

function context(options?: { enabled?: boolean; tracerName?: string }): IPipelineContext {
  return {
    correlationId: 'corr-1',
    originalCorrelationId: 'corr-1',
    tenantId: 'tenant-a',
    request: { id: '1' },
    requestType: class GetThingQuery {},
    requestName: 'GetThingQuery',
    handlerType: class GetThingHandler {},
    handlerName: 'GetThingHandler',
    requestKind: 'query',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: () => options,
  } as unknown as IPipelineContext;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TraceBehavior', () => {
  it('uses the OpenTelemetry tracer without probing provider implementation details', async () => {
    const span = {
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    };
    const startActiveSpan = vi.fn(async (_name, _options, callback) => callback(span));
    const getTracer = vi.spyOn(trace, 'getTracer').mockReturnValue({ startActiveSpan } as never);
    const next = vi.fn().mockResolvedValue('ok');

    const result = await new TraceBehavior().handle(context(), next);

    expect(result).toBe('ok');
    expect(getTracer).toHaveBeenCalledWith('nestjs-pipeline');
    expect(startActiveSpan).toHaveBeenCalledOnce();
    expect(span.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('honors enabled:false by bypassing all OpenTelemetry calls', async () => {
    const getTracer = vi.spyOn(trace, 'getTracer');
    const next = vi.fn().mockResolvedValue('disabled');

    await expect(
      new TraceBehavior().handle(context({ enabled: false }), next),
    ).resolves.toBe('disabled');

    expect(getTracer).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it('uses a per-handler tracer name when configured', async () => {
    const span = { setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() };
    const startActiveSpan = vi.fn(async (_name, _options, callback) => callback(span));
    const getTracer = vi.spyOn(trace, 'getTracer').mockReturnValue({ startActiveSpan } as never);

    await new TraceBehavior().handle(
      context({ tracerName: 'orders-api' }),
      async () => 'ok',
    );

    expect(getTracer).toHaveBeenCalledWith('orders-api');
  });

  it('records thrown errors, marks the span failed, ends it, and rethrows', async () => {
    const span = {
      setStatus: vi.fn(),
      recordException: vi.fn(),
      end: vi.fn(),
    };
    const startActiveSpan = vi.fn(async (_name, _options, callback) => callback(span));
    vi.spyOn(trace, 'getTracer').mockReturnValue({ startActiveSpan } as never);
    const failure = new Error('boom');

    await expect(
      new TraceBehavior().handle(context(), async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(span.recordException).toHaveBeenCalledWith(failure);
    expect(span.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'boom',
    });
    expect(span.end).toHaveBeenCalledOnce();
  });
});
