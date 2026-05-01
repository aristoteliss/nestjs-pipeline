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
  untyped,
} from '@nestjs-pipeline/core';
import {
  Attributes,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';

/** Options for the TraceBehavior. */
export interface TraceBehaviorOptions {
  /**
   * Name of the tracer shown in your APM tool (e.g. SigNoz / Datadog).
   * Defaults to 'nestjs-pipeline'.
   */
  tracerName?: string;
}

const TRACER_NAME = 'nestjs-pipeline';

/**
 * Returns a real Tracer only when the OTel SDK is properly initialized.
 *
 * `trace.getTracer()` NEVER throws and NEVER returns undefined — when the SDK is
 * absent it silently returns a NoopTracer that discards all spans. We detect this
 * by checking whether ProxyTracerProvider (set by NodeSDK) has a real delegate,
 * and return undefined ourselves so callers can skip span creation entirely.
 */
function isSdkInitialized(): boolean {
  const provider = untyped(trace.getTracerProvider());
  if (typeof provider?.getDelegate !== 'function') return false;
  const delegate = provider.getDelegate();
  return !!delegate && typeof delegate.getTracer === 'function';
}

@Injectable()
export class TraceBehavior implements IPipelineBehavior, OnModuleInit {
  private readonly logger: LoggerService;
  private readonly context: string | undefined;
  /** false = SDK not initialized; handle() will pass through without tracing. */
  private sdkReady = false;

  constructor(
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    if (!logger) {
      this.logger = new Logger(TraceBehavior.name, { timestamp: true });
      return;
    }

    this.logger = logger;
    this.context = TraceBehavior.name;
    if (typeof (untyped(this.logger)).setContext === 'function') {
      (this.logger as any).setContext(this.context);
    }
  }

  onModuleInit(): void {
    this.sdkReady = isSdkInitialized();

    if (!this.sdkReady) {
      this.logger.warn(
        'OpenTelemetry SDK is NOT initialized — TraceBehavior will pass through without tracing. ' +
        'Ensure your tracing bootstrap runs BEFORE NestFactory.create() ' +
        '(import "./tracing" as the first line of main.ts, or use --require ./tracing.js).',
        this.context
      );
    } else {
      this.logger.log(
        'OpenTelemetry tracer provider is active — spans will be emitted.',
        this.context
      );
    }
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    // sdkReady is false when SDK was not initialized — skip span creation entirely.
    // trace.getTracer() would NOT throw here, but would silently discard all spans.
    if (!this.sdkReady) {
      return next();
    }

    const options =
      context.getBehaviorOptions<TraceBehaviorOptions>(TraceBehavior);
    // Per-handler tracerName wins; falls back to the package default.
    const tracer = trace.getTracer(options?.tracerName ?? TRACER_NAME);
    const spanName = `${context.requestKind}.${context.requestName}`;

    const attributes: Attributes = {
      'pipeline.request.kind': context.requestKind,
      'pipeline.request.name': context.requestName,
      'pipeline.handler.name': context.handlerName,
      'pipeline.correlation_id': context.correlationId,
      'pipeline.started_at': context.startedAt.toISOString(),
    };

    return tracer.startActiveSpan(
      spanName,
      { kind: SpanKind.INTERNAL, attributes },
      async (span) => {
        try {
          const result = await next();
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (err: unknown) {
          if (err instanceof Error) {
            span.recordException(err);
          }
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: untyped(err)?.message as string,
          });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }
}
