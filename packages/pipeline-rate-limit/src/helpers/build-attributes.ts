/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getPipelineItem, type IPipelineContext } from '@nestjs-pipeline/core';
import { RATE_LIMIT_ITEM_TOKEN } from '../rate-limit.behavior.js';

/**
 * The rate-limit decision of one execution as flat attributes:
 * `rate_limit.remaining_points` once `RateLimitBehavior` consumed points and the
 * limiter reported what remains, `{}` otherwise. The key is never included: it
 * carries the tenant and the caller.
 *
 * The result is plain data and needs no telemetry package: put it on a span, a
 * log line, an audit record or a metric label (bounded values only). The remaining points take as many values as the limiter has
 * points; keep them out of metric labels unless that is bounded enough.
 *
 * @param context - The pipeline execution, read after `RateLimitBehavior` ran.
 * @returns The attributes; empty when the behavior did not run.
 *
 * @example Span attributes, with `AttributesBehavior` of `@nestjs-pipeline/opentelemetry`
 * ```ts
 * PipelineModule.forRoot({
 *   globalBehaviors: {
 *     before: [TraceBehavior, [AttributesBehavior, { factories: [buildRateLimitAttributes] }]],
 *   },
 * });
 * ```
 *
 * @example Audit metadata: `audit()` is declared outside `rateLimit()`, so the
 * record is built after its decision
 * ```ts
 * @UsePipeline(
 *   audit({ action: 'order.create', metadata: buildRateLimitAttributes }),
 *   rateLimit({ keyFactory, points: 1 }),
 * )
 * ```
 *
 * @example A log line from a custom behavior, after the chain ran
 * ```ts
 * async handle(context: IPipelineContext, next: NextDelegate) {
 *   try {
 *     return await next();
 *   } finally {
 *     this.logger.log({ request: context.requestName, ...buildRateLimitAttributes(context) });
 *   }
 * }
 * ```
 */
export function buildRateLimitAttributes(
  context: IPipelineContext,
): Record<string, number> {
  const result = getPipelineItem(context, RATE_LIMIT_ITEM_TOKEN);
  return typeof result?.remainingPoints === 'number'
    ? { 'rate_limit.remaining_points': result.remainingPoints }
    : {};
}
