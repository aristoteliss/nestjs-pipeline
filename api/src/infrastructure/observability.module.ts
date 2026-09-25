/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IncomingMessage } from 'node:http';
import { AUDIT_MODULE_DEFAULTS } from '@common/audit/audit.options';
import { setTenantResolver } from '@cqrs-ddd/core/application';
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
import { currentTenantId } from '@nestjs-pipeline/tenant';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { LoggerModule, NativeLogger } from 'nestjs-pino';
import { TelemetryBridgeBehavior } from './behaviors/telemetry-bridge.behavior';

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
 * It also makes the pipeline's tenant the tenant of `@cqrs-ddd/core`'s
 * tenant-scoped helpers (`filterCacheKey`, `cacheKeyTemplate`), before any
 * lifecycle hook can start work that reads it.
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
            logging({ requestResponseLogLevel: 'log' }),
            [TraceBehavior, { tracerName: 'users-api' }],
            [MetricsBehavior, { meterName: 'users-api' }],
            // Inside the tracer, outside the add-ons: it reads their context
            // items on unwind and TraceBehavior reads the merged bag after.
            TelemetryBridgeBehavior,
            ZodValidationBehavior,
          ],
        },
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
export class ObservabilityModule {
  constructor() {
    setTenantResolver(currentTenantId);
  }
}
