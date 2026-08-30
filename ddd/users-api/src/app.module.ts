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
import { AuthSessionInterceptor } from '@common/interceptors/auth-session.interceptor';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CqrsModule } from '@nestjs/cqrs';
import { AuditModule } from '@nestjs-pipeline/audit';
import { CacheModule } from '@nestjs-pipeline/cache';
import { CaslModule } from '@nestjs-pipeline/casl';
import {
  LOGGING_BEHAVIOR_LOGGER,
  LoggingBehavior,
  PipelineModule,
} from '@nestjs-pipeline/core';
import {
  getCorrelationId,
  HttpCorrelationMiddleware,
  runWithCorrelationId,
} from '@nestjs-pipeline/correlation';
import {
  BullMqDeadLetterTransport,
  DeadLetterBehavior,
  DeadLetterModule,
} from '@nestjs-pipeline/deadletter';
import { FeatureFlagsModule } from '@nestjs-pipeline/feature-flags';
import { IdempotencyModule } from '@nestjs-pipeline/idempotency';
import { MetricsBehavior, TraceBehavior } from '@nestjs-pipeline/opentelemetry';
import { RateLimitModule } from '@nestjs-pipeline/rate-limit';
import { ResilienceModule } from '@nestjs-pipeline/resilience';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';
import { InMemoryProvider } from '@openfeature/server-sdk';
import { TenantSchemaMiddleware } from '@persistence/middlewares/tenant-schema.middleware';
import { PersistenceModule } from '@persistence/persistence.module';
import type { Queue } from 'bullmq';
import { LoggerModule, NativeLogger } from 'nestjs-pino';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { AuthsModule } from './auths/auths.module';
import { GetUserCapabilitiesQueryRepository } from './auths/repositories/get-user-capabilities.query-repository';
import { GetRolesCapabilitiesQueryRepository } from './roles/persistence/get-roles-capabilities.query-repository';
import { RolesModule } from './roles/roles.module';
import { GetUserContextQueryRepository } from './users/persistence/get-user-context.query-repository';
import { UsersModule } from './users/users.module';

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
                  //singleLine: true,
                  messageFormat: '[{context}] {msg}',
                  //ignore: 'pid,hostname,context,req,res,responseTime',
                  translateTime: 'SYS:HH:MM:ss.l',
                },
              }
            : undefined,
        customProps: (req: IncomingMessage) => ({
          context: `${req.method} ${req.url}`,
        }),
      },
    }),
    CqrsModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    PipelineModule.forRoot({
      /**
       * Bridge correlation IDs from @nestjs-pipeline/correlation into the pipeline.
       * getCorrelationId() reads from HTTP middleware, @WithCorrelation, or
       * runWithCorrelationId, while correlationIdRunner keeps the handler chain
       * inside the same correlation AsyncLocalStorage context.
       */
      correlationIdFactory: getCorrelationId,
      correlationIdRunner: runWithCorrelationId,
      /**
       * Register global behaviors once so every command, query, and event handler
       * shares the same dead-letter/logging/tracing/metrics/validation pipeline by
       * default — without repeating them on each handler.
       * A handler may still opt into a per-handler `@UsePipeline` entry: if it
       * declares the same behavior class as a global one, the handler's entry
       * REPLACES the global entry for that handler (it does not run twice). This is
       * how individual handlers override `LoggingBehavior` with a custom
       * `requestResponseLogLevel` while everything else falls back to these globals.
       *
       * before: DeadLetterBehavior + LoggingBehavior + ZodValidationBehavior
       * - DeadLetterBehavior observes final failures outside per-handler retries
       * - LoggingBehavior emits request/response + timing logs
       * - LoggingBehavior uses nestjs-pino through LOGGING_BEHAVIOR_LOGGER provider
       * - ZodValidationBehavior normalizes request data before any per-handler
       *   authorization, rate-limit, cache, or idempotency behavior sees it
       *
       * after: TraceBehavior + MetricsBehavior
       * - TraceBehavior creates OTel spans (and uses nestjs-pino via LOGGING_BEHAVIOR_LOGGER)
       * - MetricsBehavior records execution duration histogram and invocation counters
       */
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
    /**
     * Configures the transport used by the globally attached DeadLetterBehavior
     * above. When any command, query, or event handler finally fails — after any
     * per-handler ResilienceBehavior retries are exhausted — the behavior attempts
     * to send the failed request for inspection/replay. Payload and metadata
     * must be serializable by the configured transport.
     * Transport errors are logged and the original handler error is re-thrown.
     * The capture marker records whether transport delivery succeeded.
     *
     * The transport is the only backend-specific piece: this app uses the
     * BullMQ default (reusing the Redis connection already configured above),
     * but swapping to RabbitMQ or Postgres is a one-line change here — handler
     * code never changes:
     *
     *   useFactory: (confirmChannel) => new RabbitMqDeadLetterTransport(confirmChannel)
     *   useFactory: (pool) => new PostgresDeadLetterTransport(pool)
     *
     * Inspect queued dead-letter records with Bull Board or queue.getJobs().
     * Replay requires an application-specific worker/tool that validates a
     * record and re-dispatches its original request; these are ordinary waiting
     * jobs, not failed jobs eligible for job.retry().
     */
    DeadLetterModule.forRootAsync({
      imports: [BullModule.registerQueue({ name: 'dead-letters' })],
      inject: [getQueueToken('dead-letters')],
      useFactory: (queue: Queue) => new BullMqDeadLetterTransport(queue),
    }),
    /**
     * Configures RateLimitBehavior so handlers can opt in per-handler via
     * `@UsePipeline([RateLimitBehavior, { ... }])` (see CreateUserHandler).
     * This module registration does not attach rate limiting globally.
     *
     * Backend-agnostic via rate-limiter-flexible: this example uses an in-memory
     * limiter so it runs without external infrastructure. Swapping to a shared
     * Redis/Valkey, Mongo, or SQL backend is a one-line change here — no handler
     * code changes:
     *
     *   limiter: new RateLimiterRedis({ storeClient: redis, points: 5, duration: 60 })
     *
     * The module default below caps each bucket at 5 requests per 60s; handlers
     * pick the bucket key (e.g. per email/IP) via their `keyFactory`.
     */
    RateLimitModule.forRoot({
      limiter: new RateLimiterMemory({ points: 5, duration: 60 }),
    }),
    /**
     * Configures AuditBehavior and its default sink so handlers can opt in
     * per-handler via `@UsePipeline([AuditBehavior, { action, severity, actor }])`
     * (see DeleteUserHandler). This module registration itself does not attach the
     * behavior globally. The behavior records who did what, with what outcome,
     * duration, and a redacted payload — on BOTH success and failure.
     *
     * Sink-agnostic via the tiny `AuditSink` interface: this example uses the
     * zero-dependency LogAuditSink default (JSON lines through `console`),
     * so it runs without external infrastructure. Swapping to Postgres or your
     * own event store is a one-line change here — no handler code changes:
     *
     *   sink: new PostgresAuditSink(pool)   // + await pool.query(createAuditTableSql())
     *
     * Sensitive fields (password, token, secret, ...) are redacted before the
     * record is written.
     */
    AuditModule.forRoot(),
    /**
     * Configures IdempotencyBehavior and its default in-memory store so handlers
     * can opt in per-handler via
     * `@UsePipeline([IdempotencyBehavior, { keyFactory, ... }])` (see
     * CreateUserHandler). This module registration itself does not attach the
     * behavior globally.
     *
     * A live key is claimed atomically, preventing concurrent duplicates from
     * both executing. Successful responses are stored and replayed while the
     * record remains live. With the default `releaseOnError: true`, a failed
     * execution releases its key, so a later retry may execute the handler again.
     *
     * Store-agnostic via the tiny `IdempotencyStore` interface: this example
     * uses the zero-dependency in-memory store default, so it runs without
     * external infrastructure. Swapping to Redis (shared across instances) or
     * Postgres is a one-line change here — no handler code changes:
     *
     *   store: new RedisIdempotencyStore(redisClient)
     *   store: new PostgresIdempotencyStore(pool)   // + createIdempotencyTableSql()
     *
     * In-flight duplicates get HTTP 409 and a key reused with a different
     * payload gets HTTP 422 (see IdempotencyConflictFilter in main.ts).
     */
    IdempotencyModule.forRoot(),
    CaslModule.forRoot({
      roleProvider: GetRolesCapabilitiesQueryRepository,
      userContextResolver: GetUserContextQueryRepository,
      userCapabilityProvider: GetUserCapabilitiesQueryRepository,
      subjectContextPaths: ['sessionUser'],
      defaultFieldsFromRequest: {
        User: ['username', 'department', 'email'],
      },
    }),
    /**
     * Configures ResilienceBehavior so handlers can opt in per-handler via
     * `@UsePipeline([ResilienceBehavior, { ... }])` (see DeleteUserHandler).
     * This module registration does not attach resilience globally. No module-wide
     * defaults are set here — each handler declares its own policy.
     */
    ResilienceModule.forRoot(),
    /**
     * Configures CacheBehavior and its store for handlers that opt in via
     * `@UsePipeline([CacheBehavior, { ... }])`; this module registration itself
     * does not attach caching globally. User/role reads intentionally use only
     * their DDD repository cache so writes have one invalidation target. The demo uses an
     * in-memory store for non-production runs without REDIS_HOST and Redis
     * otherwise. Only handlers that attach CacheBehavior are cached; the module
     * default TTL is 30s.
     */
    CacheModule.forRoot(
      !process.env.REDIS_HOST && process.env.NODE_ENV !== 'production'
        ? {
            store: { type: 'memory' },
            ttl: 30_000,
          }
        : {
            store: {
              type: 'redis',
              url: `redis://${process.env.REDIS_HOST ?? 'localhost'}:${Number(
                process.env.REDIS_PORT ?? 6379,
              )}`,
            },
            ttl: 30_000,
          },
    ),
    /**
     * Configures FeatureFlagBehavior through OpenFeature so handlers can gate
     * themselves per-handler via
     * `@UsePipeline([FeatureFlagBehavior, { flag: '...' }])` (see
     * CreateUserHandler). This module registration does not attach the behavior
     * globally.
     *
     * Provider-agnostic via OpenFeature: this example uses an in-memory provider
     * so it runs without external infrastructure. Swapping to Unleash or
     * Flagsmith is a one-line change here (pass their OpenFeature provider) —
     * no handler code changes:
     *
     *   provider: new UnleashProvider({ url, appName, token })
     *   provider: new FlagsmithProvider({ environmentKey })
     *
     * The `user-registration` flag below defaults to enabled; flip it to false
     * to see CreateUserHandler short-circuit with FeatureDisabledError.
     */
    FeatureFlagsModule.forRoot({
      provider: new InMemoryProvider({
        'user-registration': {
          disabled: false,
          variants: { on: true, off: false },
          defaultVariant: 'on',
        },
        'role-creation': {
          disabled: false,
          variants: { on: true, off: false },
          defaultVariant: 'on',
        },
      }),
      context: { environment: process.env.NODE_ENV ?? 'development' },
    }),
    UsersModule,
    RolesModule,
    AuthsModule,
    PersistenceModule,
  ],
  providers: [{ provide: APP_INTERCEPTOR, useClass: AuthSessionInterceptor }],
})
export class AppModule implements NestModule {
  constructor(
    private readonly tenantSchemaMiddleware: TenantSchemaMiddleware,
  ) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(
        HttpCorrelationMiddleware,
        this.tenantSchemaMiddleware.use.bind(this.tenantSchemaMiddleware),
      )
      .forRoutes('*');
  }
}
