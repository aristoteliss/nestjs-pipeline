/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  getPipelineItem,
  hasPipelineItem,
  type IPipelineContext,
} from '@nestjs-pipeline/core';
import { CACHE_HIT_ITEM_TOKEN } from '../cache.behavior.js';

/**
 * The cache decision of one execution as flat attributes:
 * `{ 'cache.hit': boolean }` once `CacheBehavior` looked the response up, and
 * `{}` when it did not run, so a request without caching never reports a
 * fabricated miss. The cache key is never included: it carries the tenant and
 * the principal, and is unbounded as a value.
 *
 * The result is plain data and needs no telemetry package: put it on a span, a
 * log line, an audit record or a metric label (bounded values only).
 *
 * @param context - The pipeline execution, read after `CacheBehavior` ran.
 * @returns The attributes; empty when the behavior did not run.
 *
 * @example Span attributes
 * With `AttributesBehavior` of `@nestjs-pipeline/opentelemetry`:
 * ```ts
 * PipelineModule.forRoot({
 *   globalBehaviors: {
 *     before: [TraceBehavior, [AttributesBehavior, { factories: [buildCacheAttributes] }]],
 *   },
 * });
 * ```
 *
 * @example A log line from a custom behavior, after the chain ran
 * ```ts
 * async handle(context: IPipelineContext, next: NextDelegate) {
 *   try {
 *     return await next();
 *   } finally {
 *     this.logger.log({ request: context.requestName, ...buildCacheAttributes(context) });
 *   }
 * }
 * ```
 */
export function buildCacheAttributes(
  context: IPipelineContext,
): Record<string, boolean> {
  return hasPipelineItem(context, CACHE_HIT_ITEM_TOKEN)
    ? { 'cache.hit': getPipelineItem(context, CACHE_HIT_ITEM_TOKEN) === true }
    : {};
}
