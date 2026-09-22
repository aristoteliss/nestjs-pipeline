/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  type MetricsIntentOptions,
  metrics,
} from './helpers/metrics.intent';
export {
  type TraceIntentOptions,
  trace,
} from './helpers/trace.intent';
export {
  MetricsBehavior,
  type MetricsBehaviorOptions,
} from './metrics.behavior';
export {
  addPipelineTelemetryAttributes,
  buildMetricAttributes,
  buildTraceAttributes,
  getPipelineTelemetryAttributes,
  PIPELINE_OTEL_ATTRIBUTES,
  PIPELINE_TELEMETRY_ATTRIBUTES,
  type PipelineTelemetryAttributeFactory,
} from './telemetry-attributes';
export {
  TraceBehavior,
  type TraceBehaviorOptions,
} from './trace.behavior';
