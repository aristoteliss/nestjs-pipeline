/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { CACHE_HIT_ITEM } from '@nestjs-pipeline/cache';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { DEAD_LETTER_ITEM } from '@nestjs-pipeline/deadletter';
import { FEATURE_FLAG_DECISION_ITEM } from '@nestjs-pipeline/feature-flags';
import {
  IDEMPOTENCY_OWNERSHIP_LOST_ITEM,
  IDEMPOTENCY_REPLAYED_ITEM,
} from '@nestjs-pipeline/idempotency';
import { getPipelineTelemetryAttributes } from '@nestjs-pipeline/opentelemetry';
import { RATE_LIMIT_ITEM } from '@nestjs-pipeline/rate-limit';
import { describe, expect, it, vi } from 'vitest';
import { TelemetryBridgeBehavior } from './telemetry-bridge.behavior';

function makeContext(items: Map<symbol, unknown> = new Map()) {
  return { items } as unknown as IPipelineContext;
}

/** Runs the bridge with `next` publishing items the way an inner behavior does. */
async function run(publish: (items: Map<symbol, unknown>) => void = () => {}) {
  const context = makeContext();
  await new TelemetryBridgeBehavior().handle(context, async () => {
    publish(context.items as Map<symbol, unknown>);
    return 'result';
  });
  return getPipelineTelemetryAttributes(context);
}

describe('TelemetryBridgeBehavior', () => {
  it('reads items published by inner behaviors, not only ones set before it', async () => {
    // The bridge annotates on unwind. Reading before next() would capture an
    // empty bag, since every add-on publishes during its own execution.
    const attributes = await run((items) => {
      items.set(CACHE_HIT_ITEM, true);
    });

    expect(attributes).toEqual({ 'cache.hit': true });
  });

  it('writes nothing for behaviors that did not run', async () => {
    // A fabricated cache.hit=false is indistinguishable from a real miss, and
    // would make "requests that missed the cache" uncountable.
    expect(await run()).toEqual({});
  });

  it('distinguishes a real miss from an absent cache behavior', async () => {
    expect(await run((items) => items.set(CACHE_HIT_ITEM, false))).toEqual({
      'cache.hit': false,
    });
  });

  it('maps a feature flag decision, omitting fields the provider did not report', async () => {
    const attributes = await run((items) =>
      items.set(FEATURE_FLAG_DECISION_ITEM, {
        flagKey: 'new-checkout',
        value: true,
        enabled: true,
        reason: 'TARGETING_MATCH',
      }),
    );

    expect(attributes).toEqual({
      'feature_flag.key': 'new-checkout',
      'feature_flag.enabled': true,
      'feature_flag.reason': 'TARGETING_MATCH',
    });
  });

  it('carries the provider error code when evaluation failed', async () => {
    const attributes = await run((items) =>
      items.set(FEATURE_FLAG_DECISION_ITEM, {
        flagKey: 'new-checkout',
        value: false,
        enabled: false,
        variant: 'control',
        errorCode: 'PROVIDER_NOT_READY',
      }),
    );

    expect(attributes).toMatchObject({
      'feature_flag.enabled': false,
      'feature_flag.variant': 'control',
      'feature_flag.error_code': 'PROVIDER_NOT_READY',
    });
  });

  it('maps replay, lost ownership, remaining points and dead-letter capture', async () => {
    const attributes = await run((items) => {
      items.set(IDEMPOTENCY_REPLAYED_ITEM, true);
      items.set(IDEMPOTENCY_OWNERSHIP_LOST_ITEM, true);
      items.set(RATE_LIMIT_ITEM, { remainingPoints: 4 });
      items.set(DEAD_LETTER_ITEM, true);
    });

    expect(attributes).toEqual({
      'idempotency.replayed': true,
      'idempotency.ownership_lost': true,
      'rate_limit.remaining_points': 4,
      'dead_letter.captured': true,
    });
  });

  it('omits the rate-limit attribute when the store reported no points', async () => {
    expect(await run((items) => items.set(RATE_LIMIT_ITEM, {}))).toEqual({});
  });

  it('annotates a failed request and rethrows the original error', async () => {
    const context = makeContext();
    const failure = new Error('handler exploded');

    await expect(
      new TelemetryBridgeBehavior().handle(context, async () => {
        context.items.set(DEAD_LETTER_ITEM, true);
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(getPipelineTelemetryAttributes(context)).toEqual({
      'dead_letter.captured': true,
    });
  });

  it('does not fail the request when annotation throws', async () => {
    // Observability must not turn a served request into an error.
    const context = makeContext();
    vi.spyOn(context.items, 'get').mockImplementation(() => {
      throw new Error('items unavailable');
    });

    await expect(
      new TelemetryBridgeBehavior().handle(context, async () => 'result'),
    ).resolves.toBe('result');
  });
});
