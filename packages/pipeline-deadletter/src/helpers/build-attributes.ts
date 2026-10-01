/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getPipelineItem, type IPipelineContext } from '@nestjs-pipeline/core';
import { DEAD_LETTER_ITEM_TOKEN } from '../dead-letter.behavior.js';

/**
 * The dead-letter outcome of one execution as flat attributes:
 * `{ 'dead_letter.captured': true }` when `DeadLetterBehavior` delivered a
 * record of the failure, `{}` otherwise — a success, an ignored error, a
 * delivery that failed, or no dead-letter behavior at all.
 *
 * The result is plain data and needs no telemetry package: put it on a span, a
 * log line, an audit record or a metric label (bounded values only).
 *
 * @param context - The pipeline execution, read after `DeadLetterBehavior` ran.
 * @returns The attributes; empty unless a record was delivered.
 *
 * @example Span attributes, with `AttributesBehavior` of `@nestjs-pipeline/opentelemetry`
 * ```ts
 * PipelineModule.forRoot({
 *   globalBehaviors: {
 *     before: [TraceBehavior, [AttributesBehavior, { factories: [buildDeadLetterAttributes] }]],
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
 *     this.logger.log({ request: context.requestName, ...buildDeadLetterAttributes(context) });
 *   }
 * }
 * ```
 */
export function buildDeadLetterAttributes(
  context: IPipelineContext,
): Record<string, boolean> {
  return getPipelineItem(context, DEAD_LETTER_ITEM_TOKEN) === true
    ? { 'dead_letter.captured': true }
    : {};
}
