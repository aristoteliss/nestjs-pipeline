/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Injectable } from '@nestjs/common';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  type NextDelegate,
  untyped,
} from '@nestjs-pipeline/core';
import {
  type Attributes,
  type Exception,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { safely } from './helpers/safely';
import {
  buildTraceAttributes,
  getPipelineTelemetryAttributes,
  PIPELINE_OTEL_ATTRIBUTES,
  type PipelineTelemetryAttributeFactory,
  withFactoryAttributes,
} from './telemetry-attributes';

/**
 * Per-handler tracing options for {@link TraceBehavior}.
 *
 * @example Service-specific tracing
 * ```ts
 * @UsePipeline([TraceBehavior, {
 *   tracerName: 'users-api',
 *   spanName: (ctx) => `${ctx.requestKind}.${ctx.requestName}`,
 *   attributeFactory: (ctx) => ({
 *     'app.tenant': ctx.tenantId ?? 'unknown',
 *   }),
 * }])
 * export class GetUserHandler {}
 * ```
 */
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
 * With no OpenTelemetry SDK registered, `trace.getTracer()` returns a no-op
 * tracer and spans are discarded; `enabled: false` skips tracing for a handler.
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

    // The business execution is created at most once and shared. Instrumentation
    // may fail at any point — including after the span callback has already
    // invoked the handler — and must never cause a second execution.
    let business: Promise<unknown> | undefined;
    const runOnce = (): Promise<unknown> => {
      business ??= Promise.resolve().then(next);
      return business;
    };

    let tracer: ReturnType<typeof trace.getTracer>;
    let spanName: string;
    let initialAttributes: Attributes;
    try {
      tracer = trace.getTracer(options?.tracerName ?? TRACER_NAME);
      spanName = this.resolveSpanName(context, options?.spanName);
      initialAttributes = await this.resolveAttributes(context, options);
    } catch {
      // Tracing could not even be set up. Run the request untraced rather than
      // failing it.
      return runOnce();
    }

    let traced: Promise<unknown> | undefined;
    try {
      return await tracer.startActiveSpan(
        spanName,
        { kind: SpanKind.INTERNAL, attributes: initialAttributes },
        (span) => {
          traced = (async () => {
            try {
              const result = await runOnce();
              this.annotateSuccess(span, context, options);
              return result;
            } catch (error) {
              this.annotateFailure(span, context, options, error);
              throw error;
            } finally {
              safely(() => span.end());
            }
          })();
          return traced;
        },
      );
    } catch {
      // A tracer may invoke the callback and then throw without observing its promise.
      return traced ?? runOnce();
    }
  }

  /** Applies success annotations; every span call is individually guarded. */
  private annotateSuccess(
    span: Span,
    context: IPipelineContext,
    options?: TraceBehaviorOptions,
  ): void {
    if (options?.includeContextAttributes !== false) {
      safely(() =>
        span.setAttributes?.(getPipelineTelemetryAttributes(context)),
      );
    }
    safely(() =>
      span.setAttribute?.(PIPELINE_OTEL_ATTRIBUTES.OUTCOME, 'success'),
    );
    safely(() => span.setStatus?.({ code: SpanStatusCode.OK }));
  }

  /** Applies failure annotations; every span call is individually guarded. */
  private annotateFailure(
    span: Span,
    context: IPipelineContext,
    options: TraceBehaviorOptions | undefined,
    error: unknown,
  ): void {
    if (options?.includeContextAttributes !== false) {
      safely(() =>
        span.setAttributes?.(getPipelineTelemetryAttributes(context)),
      );
    }
    safely(() => {
      span.setAttribute?.(PIPELINE_OTEL_ATTRIBUTES.OUTCOME, 'failure');
      span.setAttribute?.(
        PIPELINE_OTEL_ATTRIBUTES.ERROR_TYPE,
        error instanceof Error ? error.name : 'unknown',
      );
    });

    if (options?.recordException !== false) {
      safely(() => span.recordException?.(error as Exception));
    }

    const err = untyped(error);
    safely(() =>
      span.setStatus?.({
        code: SpanStatusCode.ERROR,
        message: typeof err?.message === 'string' ? err.message : '',
      }),
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
    return withFactoryAttributes(base, options?.attributeFactory, context);
  }
}
