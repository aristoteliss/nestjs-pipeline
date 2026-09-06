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
import { metrics } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricsBehavior } from './metrics.behavior';

// ─── Mock the OTel metrics API surface ───────────────────────────────────────
// We preserve the rest of the API and stub only meter acquisition.
vi.mock('@opentelemetry/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opentelemetry/api')>();
  return {
    ...actual,
    metrics: {
      getMeter: vi.fn(),
      getMeterProvider: vi.fn(),
    },
  };
});

// ─── Instrument / Meter doubles ──────────────────────────────────────────────

const mockDuration = { record: vi.fn() };
const mockInvocations = { add: vi.fn() };

const mockMeter = {
  createHistogram: vi.fn(() => mockDuration),
  createCounter: vi.fn(() => mockInvocations),
};

// ─── Context factory ──────────────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MetricsBehavior', () => {
  let behavior: MetricsBehavior;

  beforeEach(() => {
    behavior = new MetricsBehavior();

    mockDuration.record.mockReset();
    mockInvocations.add.mockReset();
    mockMeter.createHistogram.mockClear().mockReturnValue(mockDuration);
    mockMeter.createCounter.mockClear().mockReturnValue(mockInvocations);

    vi.mocked(metrics.getMeter)
      .mockReset()
      .mockReturnValue(mockMeter as any);
  });

  it('does not mutate a shared logger and supplies its context per call', () => {
    const logger = {
      warn: vi.fn(),
      log: vi.fn(),
      setContext: vi.fn(),
    };
    vi.mocked(metrics.getMeterProvider).mockReturnValue({
      constructor: { name: 'NoopMeterProvider' },
    } as never);
    const sharedLoggerBehavior = new MetricsBehavior(logger as never);

    sharedLoggerBehavior.onModuleInit();

    expect(logger.setContext).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('SDK is NOT initialized'),
      MetricsBehavior.name,
    );
  });

  it('uses the default meter name "nestjs-pipeline" when no options are provided', async () => {
    await behavior.handle(makeCtx(), vi.fn().mockResolvedValue(null));

    expect(metrics.getMeter).toHaveBeenCalledWith('nestjs-pipeline');
  });

  it('uses the custom meterName from getBehaviorOptions when provided', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      meterName: 'my-service',
    } as any);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(metrics.getMeter).toHaveBeenCalledWith('my-service');
  });

  it('creates the duration histogram and invocation counter instruments', async () => {
    await behavior.handle(makeCtx(), vi.fn().mockResolvedValue(null));

    expect(mockMeter.createHistogram).toHaveBeenCalledWith(
      'pipeline.handler.duration',
      expect.objectContaining({ unit: 'ms' }),
    );
    expect(mockMeter.createCounter).toHaveBeenCalledWith(
      'pipeline.handler.invocations',
      expect.any(Object),
    );
  });

  it('records duration and increments the counter with outcome=success on success', async () => {
    const next = vi.fn().mockResolvedValue({ ok: true });

    const result = await behavior.handle(
      makeCtx({ requestKind: 'query', requestName: 'GetUserQuery' }),
      next,
    );

    expect(result).toEqual({ ok: true });

    const expectedAttrs = {
      'pipeline.request.kind': 'query',
      'pipeline.request.name': 'GetUserQuery',
      'pipeline.handler.name': 'TestHandler',
      outcome: 'success',
    };

    expect(mockDuration.record).toHaveBeenCalledTimes(1);
    expect(mockDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expectedAttrs,
    );
    expect(mockInvocations.add).toHaveBeenCalledWith(1, expectedAttrs);
  });

  it('records outcome=failure with error.type and re-throws on error', async () => {
    // NB: subclassing Error does NOT change `.name` unless set explicitly,
    // so the behavior reports `err.name` — here we set it to exercise that.
    class CustomError extends Error {
      override name = 'CustomError';
    }
    const next = vi.fn().mockRejectedValue(new CustomError('boom'));

    await expect(behavior.handle(makeCtx(), next)).rejects.toThrow('boom');

    const expectedAttrs = {
      'pipeline.request.kind': 'command',
      'pipeline.request.name': 'TestCommand',
      'pipeline.handler.name': 'TestHandler',
      outcome: 'failure',
      'error.type': 'CustomError',
    };

    expect(mockDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expectedAttrs,
    );
    expect(mockInvocations.add).toHaveBeenCalledWith(1, expectedAttrs);
  });

  it('records a non-negative duration in milliseconds', async () => {
    await behavior.handle(makeCtx(), vi.fn().mockResolvedValue(null));

    const [elapsed] = mockDuration.record.mock.calls[0];
    expect(elapsed).toBeTypeOf('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it('caches instruments per meter across invocations', async () => {
    const next = vi.fn().mockResolvedValue(null);

    await behavior.handle(makeCtx(), next);
    await behavior.handle(makeCtx(), next);

    // Meter resolved each call, but instruments built only once per meter.
    expect(mockMeter.createHistogram).toHaveBeenCalledTimes(1);
    expect(mockMeter.createCounter).toHaveBeenCalledTimes(1);
    expect(mockDuration.record).toHaveBeenCalledTimes(2);
  });
});
