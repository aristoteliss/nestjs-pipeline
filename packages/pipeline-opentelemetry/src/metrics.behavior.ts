/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Inject,
  Injectable,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
} from '@nestjs-pipeline/core';
import {
  type Attributes,
  type Counter,
  type Histogram,
  metrics,
  type UpDownCounter,
} from '@opentelemetry/api';
import {
  buildMetricAttributes,
  getPipelineTelemetryAttributes,
  PIPELINE_OTEL_ATTRIBUTES,
  type PipelineTelemetryAttributeFactory,
} from './telemetry-attributes';

/** Options for the {@link MetricsBehavior}. */
export interface MetricsBehaviorOptions {
  /**
   * Name of the OpenTelemetry meter the instruments are created on (shown in
   * your metrics backend, e.g. Prometheus / SigNoz / Datadog).
   *
   * @default 'nestjs-pipeline'
   */
  meterName?: string;

  /**
   * Explicitly disable metrics for this handler while keeping the behavior
   * registered globally.
   *
   * @default true
   */
  enabled?: boolean;

  /**
   * Additional request-aware metric attributes. Factory failures are ignored so
   * telemetry cannot make the business request fail.
   *
   * **Cardinality rule:** metric attributes should normally be bounded values
   * such as region, deployment, plan, operation category, or feature name. Do
   * not put correlation IDs, user IDs, order IDs, email addresses, or arbitrary
   * request values into metric labels.
   *
   * @example Safe bounded labels
   * ```ts
   * @UsePipeline([MetricsBehavior, {
   *   attributeFactory: (ctx) => ({
   *     'app.region': process.env.REGION ?? 'unknown',
   *     'app.tenant_tier': ctx.items.get('tenantTier') as string,
   *   }),
   * }])
   * ```
   */
  attributeFactory?: PipelineTelemetryAttributeFactory;

  /**
   * Include the request-local attribute bag populated through
   * `addPipelineTelemetryAttributes()` in metric labels.
   *
   * This is disabled by default because request-local bags may contain
   * correlation IDs, user IDs or other unbounded values. Enable it only when
   * your application controls that bag and guarantees bounded cardinality.
   *
   * @default false
   */
  includeContextAttributes?: boolean;
}

const METER_NAME = 'nestjs-pipeline';

/** Histogram (milliseconds) of handler execution time. */
const DURATION_METRIC = 'pipeline.handler.duration';
/** Counter of handler invocations, split by outcome. */
const INVOCATION_METRIC = 'pipeline.handler.invocations';
/** Up/down counter tracking currently executing pipeline handlers. */
const ACTIVE_METRIC = 'pipeline.handler.active';

/** Cached instruments for a single meter. */
interface MeterInstruments {
  duration: Histogram;
  invocations: Counter;
  active?: UpDownCounter;
}

/**
 * Pipeline behavior that records OpenTelemetry **metrics** for every handler it
 * wraps, complementing {@link TraceBehavior}'s spans:
 *
 * - `pipeline.handler.duration` — histogram (ms) of handler execution time;
 * - `pipeline.handler.invocations` — counter incremented once per completed call;
 * - `pipeline.handler.active` — current in-flight handler count.
 *
 * The default label set is deliberately low-cardinality:
 * `pipeline.request.kind`, `pipeline.request.name`, and
 * `pipeline.handler.name`, plus outcome/error information when the call ends.
 * The historical `outcome` label is retained for dashboard compatibility while
 * `pipeline.outcome` is also emitted as the package's namespaced semantic key.
 *
 * The OTel **Metrics API** is used directly. When no OpenTelemetry SDK / metric
 * reader is registered, the API returns no-op instruments and recordings are
 * discarded. The behavior therefore does not inspect provider implementation
 * details (`constructor.name`, private delegates, etc.) and does not need a
 * readiness heuristic.
 *
 * Instrument creation/recording and custom enrichment are best-effort: telemetry
 * must not replace a successful business result or the original business error.
 * The optional shared Nest logger constructor is retained for compatibility and
 * is used only to report genuine instrumentation failures.
 *
 * @example Global application metrics
 * ```ts
 * PipelineModule.forRoot({
 *   globalBehaviors: {
 *     scope: 'all',
 *     after: [MetricsBehavior],
 *   },
 * });
 * ```
 *
 * @example Disable a very hot handler
 * ```ts
 * @UsePipeline([MetricsBehavior, { enabled: false }])
 * export class HealthCheckHandler {}
 * ```
 */
@Injectable()
export class MetricsBehavior implements IPipelineBehavior {
  /** Lazily-created instruments, keyed by meter name. */
  private readonly instruments = new Map<string, MeterInstruments>();

  constructor(
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    private readonly logger?: LoggerService,
  ) {}

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options =
      context.getBehaviorOptions<MetricsBehaviorOptions>(MetricsBehavior);
    if (options?.enabled === false) return next();

    let instruments: MeterInstruments;
    try {
      instruments = this.getInstruments(options?.meterName ?? METER_NAME);
    } catch (error) {
      // OpenTelemetry setup must never prevent the handler from running.
      this.logger?.warn?.(
        `Failed to create OpenTelemetry pipeline metrics; failing open: ${error instanceof Error ? error.message : error}`,
        MetricsBehavior.name,
      );
      return next();
    }

    const activeAttributes = buildMetricAttributes(context);
    this.safeAdd(instruments.active, 1, activeAttributes);
    const startedAt = performance.now();

    try {
      const result = await next();
      const attributes = await this.resolveFinalAttributes(
        context,
        options,
        'success',
      );
      this.record(instruments, performance.now() - startedAt, attributes);
      return result;
    } catch (error) {
      const attributes = await this.resolveFinalAttributes(
        context,
        options,
        'failure',
        error,
      );
      this.record(instruments, performance.now() - startedAt, attributes);
      throw error;
    } finally {
      this.safeAdd(instruments.active, -1, activeAttributes);
    }
  }

  /** Builds the final metric label set after handler execution. */
  private async resolveFinalAttributes(
    context: IPipelineContext,
    options: MetricsBehaviorOptions | undefined,
    outcome: 'success' | 'failure',
    error?: unknown,
  ): Promise<Attributes> {
    const base: Attributes = {
      ...buildMetricAttributes(context),
      // Preserve the original public metric label while also exposing the
      // namespaced pipeline semantic attribute used by traces/new dashboards.
      outcome,
      [PIPELINE_OTEL_ATTRIBUTES.OUTCOME]: outcome,
      ...(outcome === 'failure'
        ? {
            [PIPELINE_OTEL_ATTRIBUTES.ERROR_TYPE]:
              error instanceof Error ? error.name : 'unknown',
          }
        : {}),
      ...(options?.includeContextAttributes
        ? getPipelineTelemetryAttributes(context)
        : {}),
    };

    if (!options?.attributeFactory) return base;
    try {
      return { ...base, ...(await options.attributeFactory(context)) };
    } catch {
      return base;
    }
  }

  /** Records duration + invocation count without changing business semantics. */
  private record(
    instruments: MeterInstruments,
    elapsedMs: number,
    attributes: Attributes,
  ): void {
    try {
      instruments.duration.record(elapsedMs, attributes);
      instruments.invocations.add(1, attributes);
    } catch (error) {
      // Observability must not replace the business result/error.
      this.logger?.debug?.(
        `Failed to record OpenTelemetry pipeline metrics: ${error instanceof Error ? error.message : error}`,
        MetricsBehavior.name,
      );
    }
  }

  /** Best-effort increment/decrement for the in-flight counter. */
  private safeAdd(
    counter: UpDownCounter | undefined,
    value: number,
    attributes: Attributes,
  ): void {
    if (!counter) return;
    try {
      counter.add(value, attributes);
    } catch (error) {
      this.logger?.debug?.(
        `Failed to update OpenTelemetry in-flight metric: ${error instanceof Error ? error.message : error}`,
        MetricsBehavior.name,
      );
    }
  }

  /** Resolves (and caches) the instruments for the given meter name. */
  private getInstruments(meterName: string): MeterInstruments {
    const cached = this.instruments.get(meterName);
    if (cached) return cached;

    const meter = metrics.getMeter(meterName);
    const created: MeterInstruments = {
      duration: meter.createHistogram(DURATION_METRIC, {
        description: 'Pipeline handler execution time',
        unit: 'ms',
      }),
      invocations: meter.createCounter(INVOCATION_METRIC, {
        description: 'Number of pipeline handler invocations',
      }),
      active: meter.createUpDownCounter?.(ACTIVE_METRIC, {
        description: 'Number of in-flight pipeline handler executions',
      }),
    };

    this.instruments.set(meterName, created);
    return created;
  }
}
