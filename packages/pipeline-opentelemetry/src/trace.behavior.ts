/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { Injectable } from '@nestjs/common';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  untyped,
} from '@nestjs-pipeline/core';
import {
  type Attributes,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import {
  buildTraceAttributes,
  getPipelineTelemetryAttributes,
  PIPELINE_OTEL_ATTRIBUTES,
  type PipelineTelemetryAttributeFactory,
} from './telemetry-attributes';

/** Options for the {@link TraceBehavior}. */
export interface TraceBehaviorOptions {
  /**
   * Name of the OpenTelemetry tracer used to create spans.
   *
   * @default 'nestjs-pipeline'
   */
  tracerName?: string;

  /**
   * Explicitly disable tracing for this handler without removing the behavior.
   * Useful when the behavior is registered globally but a hot/noisy handler
   * should not create its own pipeline span.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   * Custom span name or request-aware span-name factory.
   *
   * The default span name is `{requestKind}.{requestName}`, e.g.
   * `query.GetUserQuery`. If a factory throws or returns an empty string, the
   * default name is used so telemetry enrichment cannot break the request.
   *
   * @example
   * ```ts
   * @UsePipeline([TraceBehavior, {
   *   spanName: (ctx) => `application.${ctx.requestName}`,
   * }])
   * ```
   */
  spanName?: string | ((context: IPipelineContext) => string);

  /**
   * Additional request-aware span attributes. The factory may be synchronous or
   * asynchronous; failures are ignored so observability cannot replace the
   * business result/error.
   *
   * Prefer bounded semantic values (tenant tier, feature name, operation type)
   * rather than full request payloads or secrets.
   *
   * @example
   * ```ts
   * @UsePipeline([TraceBehavior, {
   *   attributeFactory: (ctx) => ({
   *     'app.tenant.tier': ctx.items.get('tenantTier') as string,
   *     'app.region': process.env.REGION ?? 'unknown',
   *   }),
   * }])
   * ```
   */
  attributeFactory?: PipelineTelemetryAttributeFactory;

  /**
   * Record thrown exceptions on the active span.
   *
   * Disable when another instrumentation layer already records the same
   * exception and you want to avoid duplicate exception events.
   *
   * @default true
   */
  recordException?: boolean;

  /**
   * Apply request-local attributes accumulated through
   * {@link addPipelineTelemetryAttributes} to the span. Attributes written by
   * downstream behaviors/handler are applied again after execution so late
   * enrichment is visible on the final span.
   *
   * Span attributes may legitimately contain request-local identifiers such as
   * correlation ID because traces are already request-scoped. Metric labels use
   * a stricter cardinality policy; see {@link MetricsBehaviorOptions}.
   *
   * @default true
   */
  includeContextAttributes?: boolean;
}

const TRACER_NAME = 'nestjs-pipeline';

/**
 * Pipeline behavior that wraps a handler in an OpenTelemetry span.
 *
 * The behavior deliberately does not inspect provider implementation details to
 * decide whether an SDK is installed. The OpenTelemetry API contract already
 * supplies a no-op tracer/provider when no SDK is registered, so calling
 * `trace.getTracer()` is safe before bootstrap and simply discards spans.
 *
 * This avoids coupling to private/de facto implementation details such as
 * `constructor.name`, `ProxyTracerProvider.getDelegate()`, or `NoopTracer` class
 * names. Consumers that want zero tracing calls for a handler can set
 * `enabled: false` explicitly.
 *
 * Each span includes stable pipeline semantic attributes such as request kind,
 * request name, handler name, correlation ID and start time. The final outcome
 * (`success`/`failure`) and error type are added after execution.
 *
 * @example Global tracing
 * ```ts
 * PipelineModule.forRoot({
 *   globalBehaviors: { scope: 'all', before: [TraceBehavior] },
 * });
 * ```
 *
 * @example Per-handler enrichment
 * ```ts
 * @QueryHandler(GetInvoiceQuery)
 * @UsePipeline([TraceBehavior, {
 *   spanName: 'billing.get-invoice',
 *   attributeFactory: (ctx) => ({
 *     'billing.tenant_id': ctx.tenantId ?? 'unknown',
 *   }),
 * }])
 * export class GetInvoiceHandler {}
 * ```
 */
@Injectable()
export class TraceBehavior implements IPipelineBehavior {
  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options =
      context.getBehaviorOptions<TraceBehaviorOptions>(TraceBehavior);

    if (options?.enabled === false) {
      return next();
    }

    // OpenTelemetry guarantees this is a no-op tracer when no SDK/provider is
    // registered, so no readiness heuristic is required.
    const tracer = trace.getTracer(options?.tracerName ?? TRACER_NAME);
    const spanName = this.resolveSpanName(context, options?.spanName);
    const initialAttributes = await this.resolveAttributes(context, options);

    return tracer.startActiveSpan(
      spanName,
      {
        kind: SpanKind.INTERNAL,
        attributes: initialAttributes,
      },
      async (span) => {
        try {
          const result = await next();

          // Downstream behaviors/handler may add request-local attributes after
          // the span was created; apply them again before finalizing the span.
          if (
            options?.includeContextAttributes !== false &&
            typeof span.setAttributes === 'function'
          ) {
            span.setAttributes(getPipelineTelemetryAttributes(context));
          }
          if (typeof span.setAttribute === 'function') {
            span.setAttribute(PIPELINE_OTEL_ATTRIBUTES.OUTCOME, 'success');
          }
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          if (
            options?.includeContextAttributes !== false &&
            typeof span.setAttributes === 'function'
          ) {
            span.setAttributes(getPipelineTelemetryAttributes(context));
          }
          if (typeof span.setAttribute === 'function') {
            span.setAttribute(PIPELINE_OTEL_ATTRIBUTES.OUTCOME, 'failure');
            span.setAttribute(
              PIPELINE_OTEL_ATTRIBUTES.ERROR_TYPE,
              error instanceof Error ? error.name : 'unknown',
            );
          }

          if (
            options?.recordException !== false &&
            typeof span.recordException === 'function'
          ) {
            const err = untyped(error);
            if (error instanceof Error || typeof error === 'string') {
              span.recordException(error);
            } else {
              span.recordException(err as never);
            }
          }

          const err = untyped(error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: typeof err?.message === 'string' ? err.message : '',
          });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }

  /** Resolves a configured span name without allowing enrichment failures to escape. */
  private resolveSpanName(
    context: IPipelineContext,
    configured?: string | ((context: IPipelineContext) => string),
  ): string {
    const fallback = `${context.requestKind}.${context.requestName}`;
    if (typeof configured === 'string') return configured || fallback;
    if (!configured) return fallback;

    try {
      return configured(context) || fallback;
    } catch {
      return fallback;
    }
  }

  /** Builds the initial span attribute bag; custom enrichment is fail-open. */
  private async resolveAttributes(
    context: IPipelineContext,
    options?: TraceBehaviorOptions,
  ): Promise<Attributes> {
    const base: Attributes = {
      ...buildTraceAttributes(context),
      ...(options?.includeContextAttributes !== false
        ? getPipelineTelemetryAttributes(context)
        : {}),
    };
    if (!options?.attributeFactory) return base;

    try {
      return { ...base, ...(await options.attributeFactory(context)) };
    } catch {
      // Telemetry enrichment must never make the business request fail.
      return base;
    }
  }
}
