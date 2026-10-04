/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { IncomingMessage } from 'node:http';
import { AUDIT_MODULE_DEFAULTS } from '@common/audit/audit.options.js';
import { HEADERS } from '@common/constants/headers.constants.js';
import { contextSources } from '@common/context/context-sources.js';
import { HttpRouteInterceptor } from '@common/interceptors/http-route.interceptor.js';
import { PipelineModule } from '@common/pipeline/pipeline.module.js';
import { setTenantResolver } from '@cqrs-ddd/core/application';
import { LoggingBehavior, logging } from '@cqrs-ddd/pipeline';
import { AuditBehavior, LogAuditSink } from '@cqrs-ddd/pipeline-audit';
import { buildCacheAttributes } from '@cqrs-ddd/pipeline-cache';
import {
  buildDeadLetterAttributes,
  DeadLetterBehavior,
} from '@cqrs-ddd/pipeline-deadletter';
import { buildFeatureFlagAttributes } from '@cqrs-ddd/pipeline-feature-flags';
import { buildIdempotencyAttributes } from '@cqrs-ddd/pipeline-idempotency';
import {
  AttributesBehavior,
  MetricsBehavior,
  TraceBehavior,
} from '@cqrs-ddd/pipeline-opentelemetry';
import { buildRateLimitAttributes } from '@cqrs-ddd/pipeline-rate-limit';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';
import { ZodValidationBehavior } from '@cqrs-ddd/pipeline-zod';
import { Logger, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule, NativeLogger } from 'nestjs-pino';

/** Credential headers redacted from structured HTTP logs. */
const HTTP_LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  `req.headers["${HEADERS.API_KEY}"]`,
  `req.headers["${HEADERS.API_ID}"]`,
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
];

/**
 * Configures structured HTTP logging, correlation propagation, tracing, metrics,
 * request validation and operational audit recording. It places the global
 * behaviors of every handler's pipeline, and provides the logging, telemetry,
 * validation and audit behaviors under their behavior classes. Global pipeline
 * ordering keeps telemetry around handler-local behaviors so their outcomes
 * reach the span.
 *
 * HTTP server spans carry the matched route (`HttpRouteInterceptor`).
 *
 * HTTP credentials are redacted through `HTTP_LOG_REDACT_PATHS`. Auditing uses
 * a log sink on the Nest logger with `failOpen: true`; durable audit requirements need
 * a persistent sink and an explicit failure policy.
 *
 * It also makes the pipeline's tenant the tenant of `@cqrs-ddd/core`'s
 * tenant-scoped helpers (`cacheKey`, `cacheKeyTemplate`), before any
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
    PipelineModule.forRoot({
      sources: contextSources,
      globalBehaviors: [
        {
          scope: 'all',
          before: [
            logging({ requestResponseLogLevel: 'log' }),
            [TraceBehavior, { tracerName: 'users-api' }],
            [MetricsBehavior, { meterName: 'users-api' }],
            [
              AttributesBehavior,
              {
                factories: [
                  buildFeatureFlagAttributes,
                  buildCacheAttributes,
                  buildIdempotencyAttributes,
                  buildRateLimitAttributes,
                  buildDeadLetterAttributes,
                ],
              },
            ],
            ZodValidationBehavior,
          ],
        },
        {
          scope: 'commands',
          before: [DeadLetterBehavior],
        },
        {
          scope: 'events',
          before: [DeadLetterBehavior],
        },
      ],
    }),
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: HttpRouteInterceptor },
    {
      provide: LoggingBehavior,
      inject: [NativeLogger],
      useFactory: (logger: NativeLogger) => new LoggingBehavior(logger),
    },
    TraceBehavior,
    {
      provide: MetricsBehavior,
      useFactory: () => new MetricsBehavior(new Logger(MetricsBehavior.name)),
    },
    AttributesBehavior,
    ZodValidationBehavior,
    {
      provide: AuditBehavior,
      useFactory: () => {
        const logger = new Logger(AuditBehavior.name);
        return new AuditBehavior(
          new LogAuditSink({ logger }),
          AUDIT_MODULE_DEFAULTS,
          logger,
        );
      },
    },
  ],
  exports: [LoggerModule],
})
export class ObservabilityModule {
  constructor() {
    setTenantResolver(currentTenantId);
  }
}
