/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { Client, EvaluationContext } from '@openfeature/server-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureDisabledError } from './errors/feature-disabled.error';
import { FeatureFlagEvaluationError } from './errors/feature-flag-evaluation.error';
import {
  FEATURE_FLAG_DECISION_ITEM,
  FEATURE_FLAG_ITEM,
  FEATURE_FLAG_KEY_ITEM,
  FeatureFlagBehavior,
} from './feature-flag.behavior';
import type { FeatureFlagBehaviorOptions } from './interfaces/feature-flags-options.interface';

// ─── OpenFeature client double ────────────────────────────────────────────────

const getBooleanDetails = vi.fn();
const client = { getBooleanDetails } as unknown as Client;

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
  options: FeatureFlagBehaviorOptions,
): IPipelineContext {
  vi.mocked(ctx.getBehaviorOptions).mockReturnValue(
    options as unknown as ReturnType<IPipelineContext['getBehaviorOptions']>,
  );
  return ctx;
}

describe('FeatureFlagBehavior', () => {
  beforeEach(() => getBooleanDetails.mockReset());

  it('does not mutate a shared logger and supplies its context per call', async () => {
    getBooleanDetails.mockResolvedValue({
      flagKey: 'new-checkout',
      value: true,
    });
    const logger = { debug: vi.fn(), setContext: vi.fn() };
    const behavior = new FeatureFlagBehavior(
      client,
      undefined,
      undefined,
      logger as never,
    );
    const ctx = withOptions(makeCtx(), { flag: 'new-checkout' });

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    expect(logger.setContext).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('enabled'),
      FeatureFlagBehavior.name,
    );
  });

  it('passes through without evaluating when no flag is configured', async () => {
    const behavior = new FeatureFlagBehavior(client);
    const next = vi.fn().mockResolvedValue('handler-result');

    const result = await behavior.handle(makeCtx(), next);

    expect(result).toBe('handler-result');
    expect(next).toHaveBeenCalledTimes(1);
    expect(getBooleanDetails).not.toHaveBeenCalled();
  });

  it('runs the handler when the flag is enabled and preserves original context items', async () => {
    getBooleanDetails.mockResolvedValue({
      flagKey: 'new-checkout',
      value: true,
    });
    const behavior = new FeatureFlagBehavior(client);
    const ctx = withOptions(makeCtx(), { flag: 'new-checkout' });
    const next = vi.fn().mockResolvedValue('ok');

    const result = await behavior.handle(ctx, next);

    expect(result).toBe('ok');
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.items.get(FEATURE_FLAG_KEY_ITEM)).toBe('new-checkout');
    expect(ctx.items.get(FEATURE_FLAG_ITEM)).toBe(true);
  });

  it('evaluates fail-closed by default without using correlationId as targetingKey', async () => {
    getBooleanDetails.mockResolvedValue({
      flagKey: 'thing',
      value: true,
      reason: 'STATIC',
    });
    const ctx = withOptions(
      makeCtx({ requestKind: 'query', requestName: 'GetThingQuery' }),
      { flag: 'thing' },
    );

    await new FeatureFlagBehavior(client).handle(
      ctx,
      vi.fn().mockResolvedValue(null),
    );

    expect(getBooleanDetails).toHaveBeenCalledWith('thing', false, {
      'pipeline.request.kind': 'query',
      'pipeline.request.name': 'GetThingQuery',
      'pipeline.handler.name': 'TestHandler',
      'pipeline.correlation_id': 'corr-123',
    });
  });

  it('honors a custom defaultValue', async () => {
    getBooleanDetails.mockResolvedValue({ flagKey: 'beta', value: true });
    const ctx = withOptions(makeCtx(), {
      flag: 'beta',
      defaultValue: true,
    });

    await new FeatureFlagBehavior(client).handle(
      ctx,
      vi.fn().mockResolvedValue(null),
    );

    expect(getBooleanDetails).toHaveBeenCalledWith(
      'beta',
      true,
      expect.any(Object),
    );
  });

  it('throws FeatureDisabledError when disabled and no fallback is set', async () => {
    getBooleanDetails.mockResolvedValue({
      flagKey: 'new-checkout',
      value: false,
    });
    const ctx = withOptions(makeCtx(), { flag: 'new-checkout' });
    const next = vi.fn();

    await expect(
      new FeatureFlagBehavior(client).handle(ctx, next),
    ).rejects.toMatchObject({
      flag: 'new-checkout',
      requestName: 'TestCommand',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns a request-aware fallback when disabled', async () => {
    getBooleanDetails.mockResolvedValue({
      flagKey: 'new-checkout',
      value: false,
    });
    const fallback = vi.fn(
      (ctx: IPipelineContext) => `legacy:${ctx.requestName}`,
    );
    const ctx = withOptions(makeCtx(), { flag: 'new-checkout', fallback });
    const next = vi.fn();

    const result = await new FeatureFlagBehavior(client).handle(ctx, next);

    expect(result).toBe('legacy:TestCommand');
    expect(fallback).toHaveBeenCalledWith(ctx);
    expect(next).not.toHaveBeenCalled();
  });

  it('merges module defaults under per-handler options (handler wins)', async () => {
    getBooleanDetails.mockResolvedValue({
      flagKey: 'handler-flag',
      value: true,
    });
    const defaults: FeatureFlagBehaviorOptions = {
      flag: 'default-flag',
      defaultValue: true,
    };
    const behavior = new FeatureFlagBehavior(client, defaults);
    const ctx = withOptions(makeCtx(), { flag: 'handler-flag' });

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(getBooleanDetails).toHaveBeenCalledWith(
      'handler-flag',
      true,
      expect.any(Object),
    );
  });

  it('merges module-wide and handler evaluation context (handler wins)', async () => {
    getBooleanDetails.mockResolvedValue({ flagKey: 'f', value: true });
    const moduleContext: EvaluationContext = {
      environment: 'prod',
      region: 'eu',
    };
    const behavior = new FeatureFlagBehavior(client, {}, moduleContext);
    const ctx = withOptions(makeCtx(), {
      flag: 'f',
      context: () => ({ region: 'us', tenant: 'acme' }),
    });

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(getBooleanDetails).toHaveBeenCalledWith('f', false, {
      'pipeline.request.kind': 'command',
      'pipeline.request.name': 'TestCommand',
      'pipeline.handler.name': 'TestHandler',
      'pipeline.correlation_id': 'corr-123',
      environment: 'prod',
      region: 'us',
      tenant: 'acme',
    });
  });

  it('uses a stable module targeting key and records detailed decision metadata', async () => {
    getBooleanDetails.mockResolvedValue({
      flagKey: 'checkout',
      value: true,
      variant: 'treatment',
      reason: 'TARGETING_MATCH',
    });
    const moduleContext: EvaluationContext = { environment: 'prod' };
    const ctx = withOptions(makeCtx(), {
      flag: 'checkout',
      allowedVariants: ['treatment'],
    });
    const behavior = new FeatureFlagBehavior(
      client,
      undefined,
      moduleContext,
      undefined,
      () => 'user-42',
    );

    await behavior.handle(ctx, vi.fn().mockResolvedValue('ok'));

    expect(getBooleanDetails).toHaveBeenCalledWith(
      'checkout',
      false,
      expect.objectContaining({
        targetingKey: 'user-42',
        environment: 'prod',
      }),
    );
    expect(ctx.items.get(FEATURE_FLAG_ITEM)).toBe(true);
    expect(ctx.items.get(FEATURE_FLAG_KEY_ITEM)).toBe('checkout');
    expect(ctx.items.get(FEATURE_FLAG_DECISION_ITEM)).toMatchObject({
      flagKey: 'checkout',
      value: true,
      enabled: true,
      variant: 'treatment',
      reason: 'TARGETING_MATCH',
      targetingKey: 'user-42',
    });
  });

  it('handler targeting key overrides the module targeting key', async () => {
    getBooleanDetails.mockResolvedValue({ flagKey: 'f', value: true });
    const ctx = withOptions(makeCtx(), {
      flag: 'f',
      targetingKeyFactory: () => 'account-7',
    });
    const behavior = new FeatureFlagBehavior(
      client,
      undefined,
      undefined,
      undefined,
      () => 'module-user',
    );

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(getBooleanDetails).toHaveBeenCalledWith(
      'f',
      false,
      expect.objectContaining({ targetingKey: 'account-7' }),
    );
  });

  it('blocks an enabled flag when its provider variant is not allowed', async () => {
    getBooleanDetails.mockResolvedValue({
      flagKey: 'checkout',
      value: true,
      variant: 'control',
    });
    const ctx = withOptions(makeCtx(), {
      flag: 'checkout',
      allowedVariants: ['treatment'],
    });

    await expect(
      new FeatureFlagBehavior(client).handle(ctx, vi.fn()),
    ).rejects.toBeInstanceOf(FeatureDisabledError);
    expect(ctx.items.get(FEATURE_FLAG_DECISION_ITEM)).toMatchObject({
      value: true,
      enabled: false,
      variant: 'control',
    });
  });

  it('surfaces provider-reported failures when errorPolicy=throw', async () => {
    getBooleanDetails.mockResolvedValue({
      flagKey: 'checkout',
      value: false,
      reason: 'ERROR',
      errorCode: 'PROVIDER_NOT_READY',
      errorMessage: 'warming up',
    });
    const ctx = withOptions(makeCtx(), {
      flag: 'checkout',
      errorPolicy: 'throw',
    });

    await expect(
      new FeatureFlagBehavior(client).handle(ctx, vi.fn()),
    ).rejects.toBeInstanceOf(FeatureFlagEvaluationError);
  });

  it('surfaces thrown provider failures when errorPolicy=throw', async () => {
    getBooleanDetails.mockRejectedValueOnce(new Error('provider offline'));
    const ctx = withOptions(makeCtx(), {
      flag: 'checkout',
      errorPolicy: 'throw',
    });

    await expect(
      new FeatureFlagBehavior(client).handle(ctx, vi.fn()),
    ).rejects.toMatchObject({
      name: 'FeatureFlagEvaluationError',
      providerMessage: 'provider offline',
    });
  });

  it('uses the default value when provider evaluation throws and policy is use-default', async () => {
    getBooleanDetails.mockRejectedValueOnce(new Error('provider offline'));
    const fallback = vi.fn().mockReturnValue('legacy');
    const ctx = withOptions(makeCtx(), {
      flag: 'checkout',
      defaultValue: false,
      fallback,
    });

    const result = await new FeatureFlagBehavior(client).handle(ctx, vi.fn());

    expect(result).toBe('legacy');
    expect(ctx.items.get(FEATURE_FLAG_DECISION_ITEM)).toMatchObject({
      enabled: false,
      reason: 'ERROR',
      errorMessage: 'provider offline',
    });
  });
});
