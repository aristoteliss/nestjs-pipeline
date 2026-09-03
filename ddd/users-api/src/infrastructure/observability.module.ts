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

import { IncomingMessage } from 'node:http';
import { Module } from '@nestjs/common';
import { AuditModule } from '@nestjs-pipeline/audit';
import {
  LOGGING_BEHAVIOR_LOGGER,
  LoggingBehavior,
  PipelineModule,
} from '@nestjs-pipeline/core';
import {
  getCorrelationId,
  runWithCorrelationId,
} from '@nestjs-pipeline/correlation';
import { DeadLetterBehavior } from '@nestjs-pipeline/deadletter';
import { MetricsBehavior, TraceBehavior } from '@nestjs-pipeline/opentelemetry';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';
import { LoggerModule, NativeLogger } from 'nestjs-pino';

/**
 * Infrastructure module that encapsulates all logging, telemetry, compliance auditing,
 * and global pipeline execution behaviors for the application.
 *
 * ### Responsibilities
 * - **Structured HTTP Logging**: Boots `nestjs-pino` with JSON logs in production and pretty-printing in development.
 * - **Distributed Correlation Tracing**: Bridges `getCorrelationId()` and `runWithCorrelationId()` from `@nestjs-pipeline/correlation` into every pipeline handler.
 * - **Global Pipeline Execution Chain**:
 *   - `DeadLetterBehavior`: Observes final unhandled execution failures outside retries.
 *   - `LoggingBehavior`: Emits structured command/query execution logs and duration measurements.
 *   - `ZodValidationBehavior`: Validates and sanitizes incoming request payloads before handlers execute.
 *   - `TraceBehavior`: Spans execution with OpenTelemetry distributed traces.
 *   - `MetricsBehavior`: Measures latency histograms and invocation counters for Prometheus / OTel collectors.
 * - **Compliance Auditing**: Registers `AuditModule` with default JSON log sink and automatic payload redaction.
 *
 * @example Default Configuration in AppModule
 * ```ts
 * @Module({
 *   imports: [ObservabilityModule],
 * })
 * export class AppModule {}
 * ```
 *
 * @example Customizing Log Level or Custom OTel Exporters
 * ```ts
 * // Production environments can configure LOG_LEVEL=warn and OTEL_EXPORTER_OTLP_ENDPOINT
 * // in environment variables without altering application code.
 * ```
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  colorize: true,
                  messageFormat: '[{context}] {msg}',
                  translateTime: 'SYS:HH:MM:ss.l',
                },
              }
            : undefined,
        customProps: (req: IncomingMessage) => ({
          context: `${req.method} ${req.url}`,
        }),
      },
    }),
    PipelineModule.forRoot({
      correlationIdFactory: getCorrelationId,
      correlationIdRunner: runWithCorrelationId,
      globalBehaviors: {
        scope: 'all',
        before: [DeadLetterBehavior, LoggingBehavior, ZodValidationBehavior],
        after: [
          [TraceBehavior, { tracerName: 'users-api' }],
          [MetricsBehavior, { meterName: 'users-api' }],
        ],
      },
      loggerProvider: {
        provide: LOGGING_BEHAVIOR_LOGGER,
        useExisting: NativeLogger,
      },
    }),
    AuditModule.forRoot(),
  ],
  exports: [LoggerModule, PipelineModule, AuditModule],
})
export class ObservabilityModule {}
