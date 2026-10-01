/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getPipelineItem, type IPipelineContext } from '@nestjs-pipeline/core';
import { FEATURE_FLAG_DECISION_ITEM_TOKEN } from '../feature-flag.behavior.js';

/**
 * The feature-flag decision of one execution as flat attributes, named after
 * the OpenTelemetry feature-flag conventions: `feature_flag.key` and
 * `feature_flag.enabled`, plus `feature_flag.variant` and `feature_flag.reason`
 * when the provider reported them, and `feature_flag.error_code` only when
 * evaluation failed. `{}` when `FeatureFlagBehavior` did not run. The targeting
 * key and the provider's error message are never included.
 *
 * The result is plain data and needs no telemetry package: put it on a span, a
 * log line, an audit record or a metric label (bounded values only).
 *
 * @param context - The pipeline execution, read after `FeatureFlagBehavior` ran.
 * @returns The attributes; empty when the behavior did not run.
 *
 * @example Span attributes, with `AttributesBehavior` of `@nestjs-pipeline/opentelemetry`
 * ```ts
 * PipelineModule.forRoot({
 *   globalBehaviors: {
 *     before: [TraceBehavior, [AttributesBehavior, { factories: [buildFeatureFlagAttributes] }]],
 *   },
 * });
 * ```
 *
 * @example Audit metadata: `audit()` is declared outside `featureFlag()`, so the
 * record is built after its decision
 * ```ts
 * @UsePipeline(
 *   audit({ action: 'order.create', metadata: buildFeatureFlagAttributes }),
 *   featureFlag({ flag: 'checkout' }),
 * )
 * ```
 *
 * @example A log line from a custom behavior, after the chain ran
 * ```ts
 * async handle(context: IPipelineContext, next: NextDelegate) {
 *   try {
 *     return await next();
 *   } finally {
 *     this.logger.log({ request: context.requestName, ...buildFeatureFlagAttributes(context) });
 *   }
 * }
 * ```
 */
export function buildFeatureFlagAttributes(
  context: IPipelineContext,
): Record<string, string | boolean> {
  const decision = getPipelineItem(context, FEATURE_FLAG_DECISION_ITEM_TOKEN);
  if (!decision) return {};
  return {
    'feature_flag.key': decision.flagKey,
    'feature_flag.enabled': decision.enabled,
    ...(decision.variant ? { 'feature_flag.variant': decision.variant } : {}),
    ...(decision.reason ? { 'feature_flag.reason': decision.reason } : {}),
    ...(decision.errorCode
      ? { 'feature_flag.error_code': decision.errorCode }
      : {}),
  };
}
