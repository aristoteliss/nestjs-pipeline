/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RATE_LIMIT_CAPACITY } from '@common/constants';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs-pipeline/cache';
import {
  BullMqDeadLetterTransport,
  DeadLetterModule,
} from '@nestjs-pipeline/deadletter';
import { FeatureFlagsModule } from '@nestjs-pipeline/feature-flags';
import { IdempotencyModule } from '@nestjs-pipeline/idempotency';
import { RateLimitModule } from '@nestjs-pipeline/rate-limit';
import { ResilienceModule } from '@nestjs-pipeline/resilience';
import { InMemoryProvider } from '@openfeature/server-sdk';
import type { Queue } from 'bullmq';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { DEAD_LETTER_DEFAULTS } from './dead-letter.options';

/**
 * Wires BullMQ dead-letter delivery, rate limiting, idempotency, resilience,
 * response caching and feature flags for handler-local pipeline configuration.
 *
 * Rate-limit quotas and idempotency records are process-local. Response caching
 * uses memory for local development and Redis when REDIS_HOST is configured or
 * NODE_ENV is production. Repository snapshot caching has its own adapters and
 * invalidation lifecycle; this module configures pipeline response caching.
 *
 * @example Register the pipeline infrastructure alongside observability
 * ```ts
 * @Module({ imports: [ObservabilityModule, ReliabilityModule] })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
      },
    }),
    DeadLetterModule.forRootAsync({
      imports: [
        BullModule.registerQueue({
          name: 'dead-letters',
          forceDisconnectOnShutdown: true,
        }),
      ],
      inject: [getQueueToken('dead-letters')],
      useFactory: (queue: Queue) => new BullMqDeadLetterTransport(queue),
      defaults: DEAD_LETTER_DEFAULTS,
    }),
    RateLimitModule.forRoot({
      limiter: new RateLimiterMemory(RATE_LIMIT_CAPACITY),
    }),
    IdempotencyModule.forRoot(),
    ResilienceModule.forRoot(),
    CacheModule.forRootAsync({
      useFactory: () =>
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
    }),
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
  ],
  exports: [
    BullModule,
    DeadLetterModule,
    RateLimitModule,
    IdempotencyModule,
    ResilienceModule,
    CacheModule,
    FeatureFlagsModule,
  ],
})
export class ReliabilityModule {}
