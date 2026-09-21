/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TraceBehavior } from './trace.behavior';

function makeCtx(options?: { enabled?: boolean }): IPipelineContext {
  return {
    correlationId: 'real-api-correlation',
    request: { id: '1' },
    requestType: class RealApiQuery {},
    requestName: 'RealApiQuery',
    handlerType: class RealApiHandler {},
    handlerName: 'RealApiHandler',
    requestKind: 'query',
    startedAt: new Date(),
    response: undefined,
    items: new Map(),
    getBehaviorOptions: vi.fn().mockReturnValue(options),
  } as unknown as IPipelineContext;
}

describe('TraceBehavior (real OpenTelemetry API)', () => {
  beforeEach(() => trace.disable());
  afterEach(() => trace.disable());

  it('executes successfully through the API-provided no-op tracer when no SDK is registered', async () => {
    const next = vi.fn().mockResolvedValue('pipeline-output');

    await expect(new TraceBehavior().handle(makeCtx(), next)).resolves.toBe(
      'pipeline-output',
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('preserves handler errors when the global tracer is a no-op', async () => {
    const failure = new Error('real-api failure');

    await expect(
      new TraceBehavior().handle(makeCtx(), async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });

  it('uses an installed global TracerProvider without readiness probing', async () => {
    const span = {
      setAttribute: vi.fn(),
      setAttributes: vi.fn(),
      setStatus: vi.fn(),
      end: vi.fn(),
      recordException: vi.fn(),
    };
    const tracer = {
      startActiveSpan: vi.fn(
        (_name: string, _opts: any, fn: (activeSpan: any) => any) => fn(span),
      ),
    };
    const provider = { getTracer: vi.fn().mockReturnValue(tracer) };
    trace.setGlobalTracerProvider(provider as any);

    const next = vi.fn().mockResolvedValue('success');
    await expect(new TraceBehavior().handle(makeCtx(), next)).resolves.toBe(
      'success',
    );

    expect(provider.getTracer).toHaveBeenCalled();
    expect(tracer.startActiveSpan).toHaveBeenCalledWith(
      'query.RealApiQuery',
      expect.anything(),
      expect.any(Function),
    );
    expect(span.end).toHaveBeenCalledOnce();
  });

  it('respects enabled:false even when a global TracerProvider is installed', async () => {
    const tracer = { startActiveSpan: vi.fn() };
    trace.setGlobalTracerProvider({ getTracer: () => tracer } as any);
    const next = vi.fn().mockResolvedValue('bypassed');

    await expect(
      new TraceBehavior().handle(makeCtx({ enabled: false }), next),
    ).resolves.toBe('bypassed');

    expect(tracer.startActiveSpan).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });
});
