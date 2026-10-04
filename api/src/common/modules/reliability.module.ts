/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { RATE_LIMIT_CAPACITY, RATE_LIMITER } from '@common/constants/index.js';
import { redisConfig } from '@common/environment/redis.config.js';
import { buildCache, CacheBehavior } from '@cqrs-ddd/pipeline-cache';
import {
  BullMqDeadLetterTransport,
  DeadLetterBehavior,
} from '@cqrs-ddd/pipeline-deadletter';
import {
  createFeatureFlagClient,
  FeatureFlagBehavior,
  releaseFeatureFlagProvider,
} from '@cqrs-ddd/pipeline-feature-flags';
import {
  IdempotencyBehavior,
  MemoryIdempotencyStore,
} from '@cqrs-ddd/pipeline-idempotency';
import {
  RateLimitBehavior,
  type RateLimiterLike,
} from '@cqrs-ddd/pipeline-rate-limit';
import { ResilienceBehavior } from '@cqrs-ddd/pipeline-resilience';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import {
  Inject,
  Logger,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { TypedInMemoryProvider } from '@openfeature/server-sdk';
import type { Queue } from 'bullmq';
import type { Cache } from 'cache-manager';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { DEAD_LETTER_DEFAULTS } from '../dead-letter/dead-letter.options.js';

/** Injection token of the store `CacheBehavior` caches handler responses in. */
export const RESPONSE_CACHE = Symbol('RESPONSE_CACHE');

const FEATURE_FLAGS = {
  provider: new TypedInMemoryProvider({
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
};

/**
 * Wires BullMQ, and the behaviors that handlers place for reliability: dead
 * letters, rate limiting, idempotency, resilience, response caching and feature
 * flags. Each is a provider under its behavior class, built once here; the
 * pipeline takes these instances.
 *
 * Rate-limit quotas and idempotency records are process-local. Response caching
 * uses memory for local development and Redis when REDIS_HOST is configured or
 * NODE_ENV is production. Every Redis client takes its connection from
 * `redisConfig()`. Repository snapshot caching has its own adapters and
 * invalidation lifecycle; this module configures pipeline response caching.
 * On shutdown it stops the idempotency store's sweep, disconnects the response
 * cache and releases the feature-flag provider.
 *
 * @example Register the pipeline infrastructure alongside observability
 * ```ts
 * @Module({ imports: [ObservabilityModule, ReliabilityModule] })
 * export class AppModule {}
 * ```
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      useFactory: () => {
        const { host, port } = redisConfig();
        return { connection: { host, port } };
      },
    }),
    BullModule.registerQueue({
      name: 'dead-letters',
      forceDisconnectOnShutdown: true,
    }),
  ],
  providers: [
    {
      provide: DeadLetterBehavior,
      inject: [getQueueToken('dead-letters')],
      useFactory: (queue: Queue) =>
        new DeadLetterBehavior(
          new BullMqDeadLetterTransport(queue),
          DEAD_LETTER_DEFAULTS,
          new Logger(DeadLetterBehavior.name),
        ),
    },
    {
      provide: RATE_LIMITER,
      useFactory: () => new RateLimiterMemory(RATE_LIMIT_CAPACITY),
    },
    {
      provide: RateLimitBehavior,
      inject: [RATE_LIMITER],
      useFactory: (limiter: RateLimiterLike) =>
        new RateLimitBehavior(
          limiter,
          undefined,
          new Logger(RateLimitBehavior.name),
        ),
    },
    {
      provide: MemoryIdempotencyStore,
      useFactory: () => new MemoryIdempotencyStore(),
    },
    {
      provide: IdempotencyBehavior,
      inject: [MemoryIdempotencyStore],
      useFactory: (store: MemoryIdempotencyStore) =>
        new IdempotencyBehavior(
          store,
          undefined,
          new Logger(IdempotencyBehavior.name),
        ),
    },
    {
      provide: ResilienceBehavior,
      useFactory: () =>
        new ResilienceBehavior(undefined, new Logger(ResilienceBehavior.name)),
    },
    {
      provide: RESPONSE_CACHE,
      useFactory: () => {
        const redis = redisConfig();
        return buildCache({
          store:
            !redis.isConfigured && process.env.NODE_ENV !== 'production'
              ? { type: 'memory' }
              : { type: 'redis', url: redis.url },
          ttl: 30_000,
        });
      },
    },
    {
      provide: CacheBehavior,
      inject: [RESPONSE_CACHE],
      useFactory: (cache: Cache) =>
        new CacheBehavior(cache, undefined, new Logger(CacheBehavior.name)),
    },
    {
      provide: FeatureFlagBehavior,
      useFactory: async () =>
        new FeatureFlagBehavior(
          await createFeatureFlagClient(FEATURE_FLAGS),
          undefined,
          { environment: process.env.NODE_ENV ?? 'development' },
          new Logger(FeatureFlagBehavior.name),
        ),
    },
  ],
  exports: [BullModule, RATE_LIMITER],
})
export class ReliabilityModule implements OnApplicationShutdown {
  constructor(
    private readonly idempotencyStore: MemoryIdempotencyStore,
    @Inject(RESPONSE_CACHE) private readonly responseCache: Cache,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    this.idempotencyStore.destroy();
    await this.responseCache.disconnect();
    await releaseFeatureFlagProvider(FEATURE_FLAGS);
  }
}
