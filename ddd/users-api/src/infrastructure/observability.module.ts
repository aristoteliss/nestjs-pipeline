/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IncomingMessage } from 'node:http';
import { AUDIT_MODULE_DEFAULTS } from '@common/audit/audit.options';
import { Module } from '@nestjs/common';
import { AuditModule } from '@nestjs-pipeline/audit';
import {
  LOGGING_BEHAVIOR_LOGGER,
  logging,
  PipelineModule,
} from '@nestjs-pipeline/core';
import { correlationPipelineOptions } from '@nestjs-pipeline/correlation';
import { DeadLetterBehavior } from '@nestjs-pipeline/deadletter';
import { MetricsBehavior, TraceBehavior } from '@nestjs-pipeline/opentelemetry';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { LoggerModule, NativeLogger } from 'nestjs-pino';
import { TelemetryBridgeBehavior } from './behaviors/telemetry-bridge.behavior';
import { TenantScopeBehavior } from './behaviors/tenant-scope.behavior';

/** Credential headers redacted from structured HTTP logs. */
export const HTTP_LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-api-id"]',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
];

/**
 * Configures structured HTTP logging, correlation propagation, tracing, metrics,
 * request validation and operational audit recording. Global pipeline ordering
 * keeps telemetry around handler-local behaviors so their outcomes reach the span.
 *
 * HTTP credentials are redacted through `HTTP_LOG_REDACT_PATHS`. Auditing uses
 * the default console sink with `failOpen: true`; durable audit requirements need
 * a persistent sink and an explicit failure policy.
 *
 * @example Register application observability
 * ```ts
 * @Module({ imports: [ObservabilityModule] })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        redact: {
          paths: HTTP_LOG_REDACT_PATHS,
          censor: '[REDACTED]',
        },
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
    PipelineModule.forRootAsync({
      inject: [TenantSchemaContext],
      loggerProvider: {
        provide: LOGGING_BEHAVIOR_LOGGER,
        useExisting: NativeLogger,
      },
      globalBehaviors: [
        {
          scope: 'all',
          before: [
            // First, so the whole chain and the handler run in ddd-core's tenant scope.
            TenantScopeBehavior,
            logging({ requestResponseLogLevel: 'log' }),
            [TraceBehavior, { tracerName: 'users-api' }],
            [MetricsBehavior, { meterName: 'users-api' }],
            // Inside the tracer, outside the add-ons: it reads their context
            // items on unwind and TraceBehavior reads the merged bag after.
            TelemetryBridgeBehavior,
            ZodValidationBehavior,
          ],
        },
        // No ignoreErrors here. ReliabilityModule already declares the
        // module-wide list, and validation failures cannot reach this
        // behavior in any case: scopes compose in declaration order, so the
        // 'all' block above puts ZodValidationBehavior outside DeadLetter.
        // Repeating ZodValidationError here read as a safety net that was
        // doing nothing.
        {
          scope: 'commands',
          before: [[DeadLetterBehavior, { captureKinds: ['command'] }]],
        },
        {
          scope: 'events',
          before: [[DeadLetterBehavior, { captureKinds: ['event'] }]],
        },
      ],
      useFactory: (tenantContext: TenantSchemaContext) => ({
        ...correlationPipelineOptions(),
        tenantIdFactory: () => tenantContext.schema,
      }),
    }),
    AuditModule.forRoot({
      defaults: AUDIT_MODULE_DEFAULTS,
    }),
  ],
  exports: [LoggerModule, PipelineModule, AuditModule],
})
export class ObservabilityModule {}
