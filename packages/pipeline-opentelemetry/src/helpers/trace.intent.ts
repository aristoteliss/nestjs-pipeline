/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@nestjs-pipeline/core';
import { TraceBehavior, type TraceBehaviorOptions } from '../trace.behavior';

export type TraceIntentOptions = TraceBehaviorOptions;

/**
 * Returns a trace behavior entry for `@UsePipeline`.
 * @param options Per-handler trace options; omitted fields use behavior defaults.
 * @returns The behavior class and options tuple.
 * @example
 * ```ts
 * @UsePipeline(trace({ tracerName: 'users-api' }))
 * ```
 */
export function trace(
  options: TraceIntentOptions = {},
): PipelineBehaviorTuple<TraceBehavior, TraceBehaviorOptions> {
  return [TraceBehavior, options];
}
