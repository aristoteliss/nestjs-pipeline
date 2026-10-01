/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  AttributesBehavior,
  type AttributesBehaviorOptions,
} from './attributes.behavior.js';
export {
  type MetricsIntentOptions,
  metrics,
} from './helpers/metrics.intent.js';
export {
  type TraceIntentOptions,
  trace,
} from './helpers/trace.intent.js';
export {
  MetricsBehavior,
  type MetricsBehaviorOptions,
} from './metrics.behavior.js';
export {
  addPipelineTelemetryAttributes,
  buildMetricAttributes,
  buildTraceAttributes,
  getPipelineTelemetryAttributes,
  PIPELINE_OTEL_ATTRIBUTES,
  PIPELINE_TELEMETRY_ATTRIBUTES,
  type PipelineTelemetryAttributeFactory,
} from './telemetry-attributes.js';
export {
  TraceBehavior,
  type TraceBehaviorOptions,
} from './trace.behavior.js';
