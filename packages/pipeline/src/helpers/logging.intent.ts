/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  LoggingBehavior,
  type LoggingBehaviorOptions,
} from '../behaviors/logging.behavior';
import type { PipelineBehaviorTuple } from '../decorators/pipeline.decorator';

export type LoggingIntentOptions = LoggingBehaviorOptions;

/**
 * Returns a logging behavior entry for `@UsePipeline`.
 * @param options Per-handler logging options; omitted fields use behavior defaults.
 * @returns The behavior class and options tuple.
 * @example
 * ```ts
 * @UsePipeline(logging({ requestResponseLogLevel: 'log' }))
 * ```
 */
export function logging(
  options: LoggingIntentOptions = {},
): PipelineBehaviorTuple<LoggingBehavior, LoggingBehaviorOptions> {
  return [LoggingBehavior, options];
}
