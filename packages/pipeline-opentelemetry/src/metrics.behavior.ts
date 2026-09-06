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

import {
  Inject,
  Injectable,
  Logger,
  LoggerService,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import {
  IPipelineBehavior,
  IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  NextDelegate,
} from '@nestjs-pipeline/core';
import { Attributes, Counter, Histogram, metrics } from '@opentelemetry/api';

/** Options for the {@link MetricsBehavior}. */
export interface MetricsBehaviorOptions {
  /**
   * Name of the OpenTelemetry meter the instruments are created on (shown in
   * your metrics backend, e.g. Prometheus / SigNoz / Datadog).
   * Defaults to 'nestjs-pipeline'.
   */
  meterName?: string;
}

const METER_NAME = 'nestjs-pipeline';

/** Histogram (milliseconds) of handler execution time. */
const DURATION_METRIC = 'pipeline.handler.duration';
/** Counter of handler invocations, split by `outcome`. */
const INVOCATION_METRIC = 'pipeline.handler.invocations';

/** Cached instruments for a single meter. */
interface MeterInstruments {
  duration: Histogram;
  invocations: Counter;
}

/**
 * Best-effort check for whether a real OpenTelemetry metrics SDK
 * (MeterProvider + reader) is registered.
 *
 * Unlike tracing, the Metrics API exposes no ProxyMeterProvider, so when nothing
 * is set up `metrics.getMeterProvider()` returns the built-in NoopMeterProvider.
 * Recording to a no-op meter is always safe — this is used ONLY to emit a helpful
 * startup hint, never to gate recording.
 */
function isMetricsSdkInitialized(): boolean {
  const provider = metrics.getMeterProvider();
  return provider?.constructor?.name !== 'NoopMeterProvider';
}

/**
 * Pipeline behavior that records OpenTelemetry **metrics** for every handler it
 * wraps, complementing {@link TraceBehavior}'s spans:
 *
 * - `pipeline.handler.duration` — a histogram (ms) of handler execution time.
 * - `pipeline.handler.invocations` — a counter incremented once per call.
 *
 * Both instruments are tagged with `pipeline.request.kind`,
 * `pipeline.request.name`, `pipeline.handler.name`, and an `outcome` of
 * `success` or `failure` (plus `error.type` on failures), so you can derive
 * throughput, error-rate, and latency percentiles per handler.
 *
 * The OTel **Metrics API** is used directly. When no OpenTelemetry SDK /
 * metric reader is registered, the API returns a no-op meter and every
 * recording is silently discarded — so attaching this behavior is safe even
 * without a metrics pipeline configured. Uses the logger bound to
 * `LOGGING_BEHAVIOR_LOGGER` (e.g. nestjs-pino) when provided.
 */
@Injectable()
export class MetricsBehavior implements IPipelineBehavior, OnModuleInit {
  private readonly logger: LoggerService;
  private readonly context: string;
  /** Lazily-created instruments, keyed by meter name. */
  private readonly instruments = new Map<string, MeterInstruments>();

  constructor(
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    this.context = MetricsBehavior.name;
    if (!logger) {
      this.logger = new Logger(this.context, { timestamp: true });
      return;
    }

    this.logger = logger;
  }

  onModuleInit(): void {
    // Recording is always safe (a no-op meter just discards), so we never gate
    // handle() on this — we only surface a hint so a missing SDK isn't silent.
    if (isMetricsSdkInitialized()) {
      this.logger.log(
        'OpenTelemetry meter provider is active — pipeline metrics will be exported.',
        this.context,
      );
    } else {
      this.logger.warn(
        'OpenTelemetry metrics SDK is NOT initialized — MetricsBehavior will record ' +
          'to a no-op meter (metrics discarded). Register a MeterProvider with a ' +
          'reader/exporter to export pipeline metrics.',
        this.context,
      );
    }
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options =
      context.getBehaviorOptions<MetricsBehaviorOptions>(MetricsBehavior);
    // Per-handler meterName wins; falls back to the package default.
    const { duration, invocations } = this.getInstruments(
      options?.meterName ?? METER_NAME,
    );

    const baseAttributes: Attributes = {
      'pipeline.request.kind': context.requestKind,
      'pipeline.request.name': context.requestName,
      'pipeline.handler.name': context.handlerName,
    };

    const startedAt = performance.now();

    try {
      const result = await next();
      this.record(duration, invocations, performance.now() - startedAt, {
        ...baseAttributes,
        outcome: 'success',
      });
      return result;
    } catch (err: unknown) {
      this.record(duration, invocations, performance.now() - startedAt, {
        ...baseAttributes,
        outcome: 'failure',
        'error.type': err instanceof Error ? err.name : 'unknown',
      });
      throw err;
    }
  }

  /** Records the duration and increments the invocation counter. */
  private record(
    duration: Histogram,
    invocations: Counter,
    elapsedMs: number,
    attributes: Attributes,
  ): void {
    duration.record(elapsedMs, attributes);
    invocations.add(1, attributes);
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
    };

    this.instruments.set(meterName, created);
    return created;
  }
}
