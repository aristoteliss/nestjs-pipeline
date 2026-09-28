/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  getPipelineItem,
  hasPipelineItem,
  type IPipelineContext,
} from '@nestjs-pipeline/core';
import {
  IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN,
  IDEMPOTENCY_REPLAYED_ITEM_TOKEN,
} from '../idempotency.behavior';

/**
 * The idempotency decision of one execution as flat attributes:
 * `idempotency.replayed` once `IdempotencyBehavior` decided whether to replay,
 * and `idempotency.ownership_lost: true` only when the claim was lost while the
 * handler ran. `{}` when the behavior did not run. The key is never included:
 * it carries the tenant, the principal and the client's operation id.
 *
 * The result is plain data and needs no telemetry package: put it on a span, a
 * log line, an audit record or a metric label (bounded values only).
 *
 * @param context - The pipeline execution, read after `IdempotencyBehavior` ran.
 * @returns The attributes; empty when the behavior did not run.
 *
 * @example Span attributes, with `AttributesBehavior` of `@nestjs-pipeline/opentelemetry`
 * ```ts
 * PipelineModule.forRoot({
 *   globalBehaviors: {
 *     before: [TraceBehavior, [AttributesBehavior, { factories: [buildIdempotencyAttributes] }]],
 *   },
 * });
 * ```
 *
 * @example Audit metadata: `audit()` is declared outside `idempotent()`, so the
 * record is built after its decision
 * ```ts
 * @UsePipeline(
 *   audit({ action: 'order.create', metadata: buildIdempotencyAttributes }),
 *   idempotent({ keyFactory }),
 * )
 * ```
 *
 * @example A log line from a custom behavior, after the chain ran
 * ```ts
 * async handle(context: IPipelineContext, next: NextDelegate) {
 *   try {
 *     return await next();
 *   } finally {
 *     this.logger.log({ request: context.requestName, ...buildIdempotencyAttributes(context) });
 *   }
 * }
 * ```
 */
export function buildIdempotencyAttributes(
  context: IPipelineContext,
): Record<string, boolean> {
  const attributes: Record<string, boolean> = {};
  if (hasPipelineItem(context, IDEMPOTENCY_REPLAYED_ITEM_TOKEN)) {
    attributes['idempotency.replayed'] =
      getPipelineItem(context, IDEMPOTENCY_REPLAYED_ITEM_TOKEN) === true;
  }
  if (
    getPipelineItem(context, IDEMPOTENCY_OWNERSHIP_LOST_ITEM_TOKEN) === true
  ) {
    attributes['idempotency.ownership_lost'] = true;
  }
  return attributes;
}
