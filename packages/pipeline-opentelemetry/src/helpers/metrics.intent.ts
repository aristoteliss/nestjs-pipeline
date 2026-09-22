/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@nestjs-pipeline/core';
import {
  MetricsBehavior,
  type MetricsBehaviorOptions,
} from '../metrics.behavior';

export type MetricsIntentOptions = MetricsBehaviorOptions;

/**
 * Returns a metrics behavior entry for `@UsePipeline`.
 * @param options Per-handler metrics options; omitted fields use behavior defaults.
 * @returns The behavior class and options tuple.
 * @example
 * ```ts
 * @UsePipeline(metrics({ meterName: 'users-api.auth' }))
 * ```
 */
export function metrics(
  options: MetricsIntentOptions = {},
): PipelineBehaviorTuple<MetricsBehavior, MetricsBehaviorOptions> {
  return [MetricsBehavior, options];
}
