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
import { trace } from '@opentelemetry/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TraceBehavior } from './trace.behavior';

function makeCtx(options?: { enabled?: boolean }): IPipelineContext {
  return {
    correlationId: 'real-api-correlation',
    originalCorrelationId: 'real-api-correlation',
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
