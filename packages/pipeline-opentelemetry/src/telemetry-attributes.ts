/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '@nestjs-pipeline/core';
import type { Attributes } from '@opentelemetry/api';

/** Stable attribute names emitted by this package. */
export const PIPELINE_OTEL_ATTRIBUTES = {
  REQUEST_KIND: 'pipeline.request.kind',
  REQUEST_NAME: 'pipeline.request.name',
  HANDLER_NAME: 'pipeline.handler.name',
  CORRELATION_ID: 'pipeline.correlation_id',
  TENANT_ID: 'pipeline.tenant_id',
  STARTED_AT: 'pipeline.started_at',
  OUTCOME: 'pipeline.outcome',
  ERROR_TYPE: 'error.type',
} as const;

/**
 * Well-known request-local attribute bag. `Symbol.for` intentionally allows a
 * custom behavior to enrich telemetry without taking a package dependency.
 */
export const PIPELINE_TELEMETRY_ATTRIBUTES = Symbol.for(
  '@nestjs-pipeline/opentelemetry/attributes',
);

/** Request-aware custom attributes. Keep metric labels low-cardinality. */
export type PipelineTelemetryAttributeFactory = (
  context: IPipelineContext,
) => Attributes | Promise<Attributes>;

/** Applies a custom attribute factory over `base`; enrichment failures keep `base`. */
export async function withFactoryAttributes(
  base: Attributes,
  factory: PipelineTelemetryAttributeFactory | undefined,
  context: IPipelineContext,
): Promise<Attributes> {
  if (!factory) return base;
  try {
    return { ...base, ...(await factory(context)) };
  } catch {
    // Telemetry enrichment must never make the business request fail.
    return base;
  }
}

/** Merge request-local telemetry attributes for the active pipeline execution. */
export function addPipelineTelemetryAttributes(
  context: IPipelineContext,
  attributes: Attributes,
): void {
  const current = context.items.get(PIPELINE_TELEMETRY_ATTRIBUTES) as
    | Attributes
    | undefined;
  context.items.set(PIPELINE_TELEMETRY_ATTRIBUTES, {
    ...(current ?? {}),
    ...attributes,
  });
}

/** Read a snapshot of request-local telemetry attributes. */
export function getPipelineTelemetryAttributes(
  context: IPipelineContext,
): Attributes {
  return {
    ...((context.items.get(PIPELINE_TELEMETRY_ATTRIBUTES) as
      | Attributes
      | undefined) ?? {}),
  };
}

/** Low-cardinality attributes safe as the default metric label set. */
export function buildMetricAttributes(context: IPipelineContext): Attributes {
  return {
    [PIPELINE_OTEL_ATTRIBUTES.REQUEST_KIND]: context.requestKind,
    [PIPELINE_OTEL_ATTRIBUTES.REQUEST_NAME]: context.requestName,
    [PIPELINE_OTEL_ATTRIBUTES.HANDLER_NAME]: context.handlerName,
  };
}

/** Richer per-span attributes; trace attributes may safely carry request identity. */
export function buildTraceAttributes(context: IPipelineContext): Attributes {
  return {
    ...buildMetricAttributes(context),
    [PIPELINE_OTEL_ATTRIBUTES.CORRELATION_ID]: context.correlationId,
    [PIPELINE_OTEL_ATTRIBUTES.STARTED_AT]: context.startedAt.toISOString(),
    ...(context.tenantId
      ? { [PIPELINE_OTEL_ATTRIBUTES.TENANT_ID]: context.tenantId }
      : {}),
  };
}
