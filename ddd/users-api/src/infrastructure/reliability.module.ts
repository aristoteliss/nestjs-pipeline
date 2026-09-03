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

/**
 * Infrastructure module that encapsulates all reliability, resilience, rate limiting,
 * distributed idempotency, dead-letter capture, caching, and feature flag capabilities.
 *
 * ### Responsibilities
 * - **BullMQ & Redis Connectivity**: Connects to the Redis instance for queues and background tasks.
 * - **Dead Letter Queue (`DeadLetterModule`)**: Captures unhandled command/query failures into a dedicated BullMQ queue (`dead-letters`) for inspection or replay.
 * - **Rate Limiting (`RateLimitModule`)**: Memory-based or Redis-backed rate limiter (default: 5 ops / 60s) used by opt-in command handlers.
 * - **Idempotency (`IdempotencyModule`)**: Distributed lock claiming and cached response replaying to prevent duplicate execution of mutating operations.
 * - **Resilience Policies (`ResilienceModule`)**: Cockatiel-based retry policies, circuit breakers, and timeouts.
 * - **Response Caching (`CacheModule`)**: In-memory (development) or Redis-backed (production) query response cache with a default 30-second TTL.
 * - **Feature Flags (`FeatureFlagsModule`)**: OpenFeature provider integration gating runtime registration and role creation features.
 *
 * @example Swapping Dead Letter Transport to PostgreSQL or RabbitMQ
 * ```ts
 * // Drop-in replacement for DeadLetterModule transport:
 * DeadLetterModule.forRootAsync({
 *   inject: [PG_POOL],
 *   useFactory: (pool) => new PostgresDeadLetterTransport(pool),
 * });
 * ```
 *
 * @example Switching to Redis Distributed Rate Limiting
 * ```ts
 * RateLimitModule.forRoot({
 *   limiter: new RateLimiterRedis({ storeClient: redisClient, points: 10, duration: 60 }),
 * });
 * ```
 *
 * @example Switching to Unleash or Flagsmith Feature Flag Providers
 * ```ts
 * FeatureFlagsModule.forRoot({
 *   provider: new UnleashProvider({ url: 'https://unleash.example.com/api', appName: 'users-api', token: '...' }),
 * });
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
      imports: [BullModule.registerQueue({ name: 'dead-letters' })],
      inject: [getQueueToken('dead-letters')],
      useFactory: (queue: Queue) => new BullMqDeadLetterTransport(queue),
    }),
    RateLimitModule.forRoot({
      limiter: new RateLimiterMemory({ points: 5, duration: 60 }),
    }),
    IdempotencyModule.forRoot(),
    ResilienceModule.forRoot(),
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
