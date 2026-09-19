/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Injectable } from '@nestjs/common';
import { CACHE_HIT_ITEM } from '@nestjs-pipeline/cache';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';
import { DEAD_LETTER_ITEM } from '@nestjs-pipeline/deadletter';
import {
  FEATURE_FLAG_DECISION_ITEM,
  type FeatureFlagDecision,
} from '@nestjs-pipeline/feature-flags';
import {
  IDEMPOTENCY_OWNERSHIP_LOST_ITEM,
  IDEMPOTENCY_REPLAYED_ITEM,
} from '@nestjs-pipeline/idempotency';
import { addPipelineTelemetryAttributes } from '@nestjs-pipeline/opentelemetry';
import { RATE_LIMIT_ITEM } from '@nestjs-pipeline/rate-limit';

/**
 * Copies the add-on behaviors' context items onto the active span.
 *
 * The add-ons publish their decisions as `context.items` entries and take no
 * OpenTelemetry dependency, which is what keeps them installable one at a time.
 * The consequence is that nothing writes those decisions to a span by itself:
 * installing the packages produces no feature, cache, idempotency, rate-limit
 * or dead-letter attributes until an application joins them. This is that join,
 * and it belongs here — the composition layer is the only place that knows
 * which add-ons are present.
 *
 * Register it inside `TraceBehavior` and outside the add-ons. It reads on
 * unwind, so every inner behavior has published its item by then, and
 * `TraceBehavior` reads the merged attribute bag after this returns.
 *
 * An absent item means the behavior did not run. Nothing is written for it:
 * `cache.hit=false` on a request with no cache behavior would be a fabricated
 * negative, indistinguishable from a real miss.
 */
@Injectable()
export class TelemetryBridgeBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    try {
      return await next();
    } finally {
      this.annotate(context);
    }
  }

  /**
   * Never fails the request. A bridge that throws while describing a successful
   * execution would turn an observability gap into an outage, and the OTel
   * package holds the same fail-open contract.
   */
  private annotate(context: IPipelineContext): void {
    try {
      addPipelineTelemetryAttributes(context, {
        ...this.featureFlagAttributes(context),
        ...this.cacheAttributes(context),
        ...this.idempotencyAttributes(context),
        ...this.rateLimitAttributes(context),
        ...this.deadLetterAttributes(context),
      });
    } catch {
      /* observability must not break the request */
    }
  }

  private featureFlagAttributes(context: IPipelineContext) {
    const decision = context.items.get(FEATURE_FLAG_DECISION_ITEM) as
      | FeatureFlagDecision
      | undefined;
    if (!decision) return {};
    return {
      'feature_flag.key': decision.flagKey,
      'feature_flag.enabled': decision.enabled,
      // Variant and reason are provider-reported and may be absent; error code
      // is present only on a provider failure, which is the case worth finding.
      ...(decision.variant ? { 'feature_flag.variant': decision.variant } : {}),
      ...(decision.reason ? { 'feature_flag.reason': decision.reason } : {}),
      ...(decision.errorCode
        ? { 'feature_flag.error_code': decision.errorCode }
        : {}),
    };
  }

  private cacheAttributes(context: IPipelineContext) {
    // The key is deliberately omitted: it carries the tenant and principal, and
    // is unbounded as a span attribute.
    return context.items.has(CACHE_HIT_ITEM)
      ? { 'cache.hit': context.items.get(CACHE_HIT_ITEM) === true }
      : {};
  }

  private idempotencyAttributes(context: IPipelineContext) {
    const attributes: Record<string, boolean> = {};
    if (context.items.has(IDEMPOTENCY_REPLAYED_ITEM)) {
      attributes['idempotency.replayed'] =
        context.items.get(IDEMPOTENCY_REPLAYED_ITEM) === true;
    }
    if (context.items.get(IDEMPOTENCY_OWNERSHIP_LOST_ITEM) === true) {
      attributes['idempotency.ownership_lost'] = true;
    }
    return attributes;
  }

  private rateLimitAttributes(context: IPipelineContext) {
    const result = context.items.get(RATE_LIMIT_ITEM) as
      | { remainingPoints?: number }
      | undefined;
    if (!result) return {};
    return typeof result.remainingPoints === 'number'
      ? { 'rate_limit.remaining_points': result.remainingPoints }
      : {};
  }

  private deadLetterAttributes(context: IPipelineContext) {
    return context.items.get(DEAD_LETTER_ITEM) === true
      ? { 'dead_letter.captured': true }
      : {};
  }
}
