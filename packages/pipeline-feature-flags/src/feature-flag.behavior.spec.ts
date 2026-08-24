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
import type { Client, EvaluationContext } from '@openfeature/server-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureDisabledError } from './errors/feature-disabled.error';
import {
  FEATURE_FLAG_ITEM,
  FEATURE_FLAG_KEY_ITEM,
  FeatureFlagBehavior,
} from './feature-flag.behavior';
import type { FeatureFlagBehaviorOptions } from './interfaces/feature-flags-options.interface';

// ─── Doubles ──────────────────────────────────────────────────────────────────

const getBooleanValue = vi.fn();
const client = { getBooleanValue } as unknown as Client;

function makeCtx(overrides: Partial<IPipelineContext> = {}): IPipelineContext {
  return {
    correlationId: 'corr-123',
    originalCorrelationId: 'corr-123',
    request: { id: 1 },
    requestType: class TestCommand { },
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

function withOptions(
  ctx: IPipelineContext,
  options: FeatureFlagBehaviorOptions,
): IPipelineContext {
  vi.mocked(ctx.getBehaviorOptions).mockReturnValue(
    options as unknown as ReturnType<IPipelineContext['getBehaviorOptions']>,
  );
  return ctx;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FeatureFlagBehavior', () => {
  beforeEach(() => {
    getBooleanValue.mockReset();
  });

  it('passes through without evaluating when no flag is configured', async () => {
    const behavior = new FeatureFlagBehavior(client);
    const next = vi.fn().mockResolvedValue('handler-result');

    const result = await behavior.handle(makeCtx(), next);

    expect(result).toBe('handler-result');
    expect(next).toHaveBeenCalledTimes(1);
    expect(getBooleanValue).not.toHaveBeenCalled();
  });

  it('runs the handler when the flag is enabled and records context items', async () => {
    getBooleanValue.mockResolvedValue(true);
    const behavior = new FeatureFlagBehavior(client);
    const ctx = withOptions(makeCtx(), { flag: 'new-checkout' });
    const next = vi.fn().mockResolvedValue('ok');

    const result = await behavior.handle(ctx, next);

    expect(result).toBe('ok');
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.items.get(FEATURE_FLAG_KEY_ITEM)).toBe('new-checkout');
    expect(ctx.items.get(FEATURE_FLAG_ITEM)).toBe(true);
  });

  it('evaluates with defaultValue=false (fail-closed) and the request targeting context', async () => {
    getBooleanValue.mockResolvedValue(true);
    const behavior = new FeatureFlagBehavior(client);
    const ctx = withOptions(
      makeCtx({ requestKind: 'query', requestName: 'GetThingQuery' }),
      { flag: 'thing' },
    );

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(getBooleanValue).toHaveBeenCalledWith('thing', false, {
      targetingKey: 'corr-123',
      'pipeline.request.kind': 'query',
      'pipeline.request.name': 'GetThingQuery',
      'pipeline.handler.name': 'TestHandler',
    });
  });

  it('honors a custom defaultValue', async () => {
    getBooleanValue.mockResolvedValue(true);
    const behavior = new FeatureFlagBehavior(client);
    const ctx = withOptions(makeCtx(), {
      flag: 'beta',
      defaultValue: true,
    });

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(getBooleanValue).toHaveBeenCalledWith(
      'beta',
      true,
      expect.any(Object),
    );
  });

  it('throws FeatureDisabledError when disabled and no fallback is set', async () => {
    getBooleanValue.mockResolvedValue(false);
    const behavior = new FeatureFlagBehavior(client);
    const ctx = withOptions(makeCtx(), { flag: 'new-checkout' });
    const next = vi.fn();

    await expect(behavior.handle(ctx, next)).rejects.toBeInstanceOf(
      FeatureDisabledError,
    );
    await expect(behavior.handle(ctx, next)).rejects.toMatchObject({
      flag: 'new-checkout',
      requestName: 'TestCommand',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns the fallback (request-aware) when disabled', async () => {
    getBooleanValue.mockResolvedValue(false);
    const behavior = new FeatureFlagBehavior(client);
    const fallback = vi.fn((c: IPipelineContext) => `legacy:${c.requestName}`);
    const ctx = withOptions(makeCtx(), { flag: 'new-checkout', fallback });
    const next = vi.fn();

    const result = await behavior.handle(ctx, next);

    expect(result).toBe('legacy:TestCommand');
    expect(fallback).toHaveBeenCalledWith(ctx);
    expect(next).not.toHaveBeenCalled();
  });

  it('merges module defaults under per-handler options (handler wins)', async () => {
    getBooleanValue.mockResolvedValue(true);
    const defaults: FeatureFlagBehaviorOptions = {
      flag: 'default-flag',
      defaultValue: true,
    };
    const behavior = new FeatureFlagBehavior(client, defaults);
    // Handler overrides the flag but inherits defaultValue=true.
    const ctx = withOptions(makeCtx(), { flag: 'handler-flag' });

    await behavior.handle(ctx, vi.fn().mockResolvedValue(null));

    expect(getBooleanValue).toHaveBeenCalledWith(
      'handler-flag',
      true,
      expect.any(Object),
    );
  });

  it('merges module-wide and handler targeting context (handler wins)', async () => {
    getBooleanValue.mockResolvedValue(true);
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

    expect(getBooleanValue).toHaveBeenCalledWith('f', false, {
      targetingKey: 'corr-123',
      'pipeline.request.kind': 'command',
      'pipeline.request.name': 'TestCommand',
      'pipeline.handler.name': 'TestHandler',
      environment: 'prod',
      region: 'us',
      tenant: 'acme',
    });
  });
});
