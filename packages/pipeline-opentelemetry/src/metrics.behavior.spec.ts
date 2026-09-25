/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import { metrics } from '@opentelemetry/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetricsBehavior } from './metrics.behavior';
import { addPipelineTelemetryAttributes } from './telemetry-attributes';

// Preserve the rest of the public API and stub only meter acquisition. The
// implementation intentionally does not inspect provider implementation details.
vi.mock('@opentelemetry/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opentelemetry/api')>();
  return {
    ...actual,
    metrics: { getMeter: vi.fn() },
  };
});

const mockDuration = { record: vi.fn() };
const mockInvocations = { add: vi.fn() };
const mockActive = { add: vi.fn() };

const mockMeter = {
  createHistogram: vi.fn(() => mockDuration),
  createCounter: vi.fn(() => mockInvocations),
  createUpDownCounter: vi.fn(() => mockActive),
};

function makeCtx(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'test-corr-id',
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

describe('MetricsBehavior', () => {
  let behavior: MetricsBehavior;

  beforeEach(() => {
    behavior = new MetricsBehavior();

    mockDuration.record.mockReset();
    mockInvocations.add.mockReset();
    mockActive.add.mockReset();
    mockMeter.createHistogram.mockClear().mockReturnValue(mockDuration);
    mockMeter.createCounter.mockClear().mockReturnValue(mockInvocations);
    mockMeter.createUpDownCounter.mockClear().mockReturnValue(mockActive);

    vi.mocked(metrics.getMeter)
      .mockReset()
      .mockReturnValue(mockMeter as never);
  });

  it('keeps the optional shared logger constructor and never mutates its context', async () => {
    const logger = {
      warn: vi.fn(),
      debug: vi.fn(),
      setContext: vi.fn(),
    };
    vi.mocked(metrics.getMeter).mockImplementation(() => {
      throw new Error('meter unavailable');
    });
    const next = vi.fn().mockResolvedValue('ok');

    await expect(
      new MetricsBehavior(logger as never).handle(makeCtx(), next),
    ).resolves.toBe('ok');

    expect(logger.setContext).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('failing open'),
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
    } as never);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(metrics.getMeter).toHaveBeenCalledWith('my-service');
  });

  it('creates duration, invocation, and in-flight instruments', async () => {
    await behavior.handle(makeCtx(), vi.fn().mockResolvedValue(null));

    expect(mockMeter.createHistogram).toHaveBeenCalledWith(
      'pipeline.handler.duration',
      expect.objectContaining({ unit: 'ms' }),
    );
    expect(mockMeter.createCounter).toHaveBeenCalledWith(
      'pipeline.handler.invocations',
      expect.any(Object),
    );
    expect(mockMeter.createUpDownCounter).toHaveBeenCalledWith(
      'pipeline.handler.active',
      expect.any(Object),
    );
  });

  it('records duration and increments the counter with the historical outcome label on success', async () => {
    const next = vi.fn().mockResolvedValue({ ok: true });

    const result = await behavior.handle(
      makeCtx({ requestKind: 'query', requestName: 'GetUserQuery' }),
      next,
    );

    expect(result).toEqual({ ok: true });
    expect(mockDuration.record).toHaveBeenCalledTimes(1);
    expect(mockDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        'pipeline.request.kind': 'query',
        'pipeline.request.name': 'GetUserQuery',
        'pipeline.handler.name': 'TestHandler',
        outcome: 'success',
        'pipeline.outcome': 'success',
      }),
    );
    expect(mockInvocations.add).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        outcome: 'success',
        'pipeline.outcome': 'success',
      }),
    );
  });

  it('tracks in-flight concurrency around the handler call', async () => {
    await behavior.handle(makeCtx(), vi.fn().mockResolvedValue(null));

    const attrs = {
      'pipeline.request.kind': 'command',
      'pipeline.request.name': 'TestCommand',
      'pipeline.handler.name': 'TestHandler',
    };
    expect(mockActive.add).toHaveBeenNthCalledWith(1, 1, attrs);
    expect(mockActive.add).toHaveBeenLastCalledWith(-1, attrs);
  });

  it('records duration and invocations when the meter cannot create an in-flight counter', async () => {
    vi.mocked(metrics.getMeter).mockReturnValue({
      createHistogram: mockMeter.createHistogram,
      createCounter: mockMeter.createCounter,
    } as never);

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockResolvedValue('ok')),
    ).resolves.toBe('ok');

    expect(mockDuration.record).toHaveBeenCalledTimes(1);
    expect(mockInvocations.add).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ outcome: 'success' }),
    );
    expect(mockActive.add).not.toHaveBeenCalled();
  });

  it('records outcome=failure with error.type and re-throws the original error', async () => {
    class CustomError extends Error {
      override name = 'CustomError';
    }
    const error = new CustomError('boom');
    const next = vi.fn().mockRejectedValue(error);

    await expect(behavior.handle(makeCtx(), next)).rejects.toBe(error);

    expect(mockDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({
        outcome: 'failure',
        'pipeline.outcome': 'failure',
        'error.type': 'CustomError',
      }),
    );
    expect(mockInvocations.add).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        outcome: 'failure',
        'error.type': 'CustomError',
      }),
    );
    expect(mockActive.add).toHaveBeenLastCalledWith(-1, expect.any(Object));
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

    // Meter is resolved each call, but instruments are built only once per name.
    expect(mockMeter.createHistogram).toHaveBeenCalledTimes(1);
    expect(mockMeter.createCounter).toHaveBeenCalledTimes(1);
    expect(mockMeter.createUpDownCounter).toHaveBeenCalledTimes(1);
    expect(mockDuration.record).toHaveBeenCalledTimes(2);
  });

  it('does not include request-local attributes in metric labels by default', async () => {
    const ctx = makeCtx();
    addPipelineTelemetryAttributes(ctx, { 'user.id': 'user-123' });

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(mockDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.not.objectContaining({ 'user.id': 'user-123' }),
    );
  });

  it('can explicitly include a controlled request-local attribute bag', async () => {
    const ctx = makeCtx();
    addPipelineTelemetryAttributes(ctx, { 'app.tenant_tier': 'pro' });
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      includeContextAttributes: true,
    } as never);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(mockDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ 'app.tenant_tier': 'pro' }),
    );
  });

  it('merges request-aware custom low-cardinality attributes', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      attributeFactory: () => ({ 'app.region': 'eu-west' }),
    } as never);

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(mockDuration.record).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ 'app.region': 'eu-west' }),
    );
  });

  it('ignores custom attribute-factory failures', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      attributeFactory: () => {
        throw new Error('enrichment failed');
      },
    } as never);

    await expect(
      behavior.handle(ctx, vi.fn().mockResolvedValue('ok')),
    ).resolves.toBe('ok');
  });

  it('fails open when meter creation fails', async () => {
    vi.mocked(metrics.getMeter).mockImplementation(() => {
      throw new Error('otel broken');
    });
    const next = vi.fn().mockResolvedValue('business-result');

    await expect(behavior.handle(makeCtx(), next)).resolves.toBe(
      'business-result',
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('does not replace the business result when metric recording throws', async () => {
    mockDuration.record.mockImplementation(() => {
      throw new Error('exporter problem');
    });

    await expect(
      behavior.handle(makeCtx(), vi.fn().mockResolvedValue('business-result')),
    ).resolves.toBe('business-result');
  });

  it('can disable metrics per handler', async () => {
    const ctx = makeCtx();
    vi.mocked(ctx.getBehaviorOptions).mockReturnValue({
      enabled: false,
    } as never);
    const next = vi.fn().mockResolvedValue('ok');

    await expect(behavior.handle(ctx, next)).resolves.toBe('ok');
    expect(metrics.getMeter).not.toHaveBeenCalled();
  });
});
