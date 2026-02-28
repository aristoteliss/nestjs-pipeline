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
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */


import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IPipelineBehavior, IPipelineContext, NextDelegate } from '@nestjs-pipeline/core';
import { trace, SpanStatusCode, SpanKind, Attributes } from '@opentelemetry/api';

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
  const provider = trace.getTracerProvider() as any;
  if (typeof provider?.getDelegate !== 'function') return false;
  const delegate = provider.getDelegate();
  return !!delegate && typeof delegate.getTracer === 'function';
}

@Injectable()
export class TraceBehavior implements IPipelineBehavior, OnModuleInit {
  private readonly logger = new Logger(TraceBehavior.name);
  /** false = SDK not initialized; handle() will pass through without tracing. */
  private sdkReady = false;

  onModuleInit(): void {
    this.sdkReady = isSdkInitialized();

    if (!this.sdkReady) {
      this.logger.warn(
        'OpenTelemetry SDK is NOT initialized — TraceBehavior will pass through without tracing. ' +
        'Ensure your tracing bootstrap runs BEFORE NestFactory.create() ' +
        '(import "./tracing" as the first line of main.ts, or use --require ./tracing.js).',
      );
    } else {
      this.logger.log('OpenTelemetry tracer provider is active — spans will be emitted.');
    }
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<any> {
    // sdkReady is false when SDK was not initialized — skip span creation entirely.
    // trace.getTracer() would NOT throw here, but would silently discard all spans.
    if (!this.sdkReady) {
      return next();
    }

    const options = context.getBehaviorOptions<TraceBehaviorOptions>(TraceBehavior);
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
        } catch (err: any) {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message });
          throw err;
        } finally {
          span.end();
        }
      },
    );
  }
}
