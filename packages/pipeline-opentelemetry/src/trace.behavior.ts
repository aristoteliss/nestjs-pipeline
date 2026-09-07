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

/** Options for the TraceBehavior. */
export interface TraceBehaviorOptions {
  /** Tracer name shown in the configured OpenTelemetry backend. */
  tracerName?: string;
  /** Explicitly disable tracing for this handler. Defaults to true. */
  enabled?: boolean;
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
