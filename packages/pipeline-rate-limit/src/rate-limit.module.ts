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

import { type DynamicModule, Module } from '@nestjs/common';
import { RATE_LIMIT_DEFAULT_OPTIONS, RATE_LIMITER } from './constants/tokens';
import type {
  RateLimitModuleAsyncOptions,
  RateLimitModuleOptions,
} from './interfaces/rate-limit-options.interface';
import { RateLimitBehavior } from './rate-limit.behavior';

/**
 * NestJS module that wires a {@link RateLimiterLike} into the
 * {@link RateLimitBehavior} and binds optional module-wide default options.
 *
 * The limiter is the only backend-specific piece, so swapping memory ↔ Redis ↔
 * Mongo ↔ SQL is a one-line change — handler code never changes.
 *
 * @example In-memory (single instance / tests)
 * ```ts
 * import { RateLimitModule, RateLimitBehavior } from '@nestjs-pipeline/rate-limit';
 * import { RateLimiterMemory } from 'rate-limiter-flexible';
 *
 * @Module({
 *   imports: [
 *     RateLimitModule.forRoot({
 *       limiter: new RateLimiterMemory({ points: 10, duration: 1 }),
 *     }),
 *     PipelineModule.forRoot({ behaviors: [RateLimitBehavior] }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example Redis (shared across instances) via async factory
 * ```ts
 * RateLimitModule.forRootAsync({
 *   inject: [REDIS_CLIENT],
 *   useFactory: (redis: Redis) =>
 *     new RateLimiterRedis({ storeClient: redis, points: 100, duration: 60 }),
 * });
 * ```
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: static-only configuration class
export class RateLimitModule {
  /**
   * Registers the behavior with a ready-made limiter instance.
   *
   * @param options - The limiter and optional module-wide defaults.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRoot(options: RateLimitModuleOptions): DynamicModule {
    return {
      module: RateLimitModule,
      global: true,
      providers: [
        RateLimitBehavior,
        { provide: RATE_LIMITER, useValue: options.limiter },
        {
          provide: RATE_LIMIT_DEFAULT_OPTIONS,
          useValue: options.defaults ?? {},
        },
      ],
      exports: [RateLimitBehavior, RATE_LIMITER, RATE_LIMIT_DEFAULT_OPTIONS],
    };
  }

  /**
   * Registers the behavior, building the limiter from injected dependencies
   * (e.g. a DI-managed Redis client).
   *
   * @param options - Async factory, its injected providers, and optional defaults.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRootAsync(options: RateLimitModuleAsyncOptions): DynamicModule {
    return {
      module: RateLimitModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        RateLimitBehavior,
        {
          provide: RATE_LIMITER,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        {
          provide: RATE_LIMIT_DEFAULT_OPTIONS,
          useValue: options.defaults ?? {},
        },
      ],
      exports: [RateLimitBehavior, RATE_LIMITER, RATE_LIMIT_DEFAULT_OPTIONS],
    };
  }
}
