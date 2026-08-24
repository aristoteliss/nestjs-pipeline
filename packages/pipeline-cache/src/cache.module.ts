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
import { CacheBehavior } from './cache.behavior';
import { CACHE_DEFAULT_OPTIONS, PIPELINE_CACHE } from './constants/tokens';
import { buildCache } from './helpers/cache-factory';
import type {
  CacheBehaviorOptions,
  CacheModuleOptions,
} from './interfaces/cache-options.interface';

/**
 * NestJS module that builds the shared `cache-manager` instance, registers the
 * {@link CacheBehavior}, and (optionally) application-wide default
 * {@link CacheBehaviorOptions}.
 *
 * The store backend is selected declaratively (memory, redis, memcache,
 * sqlite, postgres) or supplied directly as a pre-built cache / Keyv stores.
 *
 * @example In-memory cache (default), per-handler configuration
 * ```ts
 * import { CacheModule, CacheBehavior } from '@nestjs-pipeline/cache';
 *
 * @Module({
 *   imports: [
 *     CacheModule.forRoot({ ttl: 30_000 }),
 *     PipelineModule.forRoot({ behaviors: [CacheBehavior] }),
 *   ],
 * })
 * export class AppModule {}
 *
 * @QueryHandler(GetUserQuery)
 * @UsePipeline([CacheBehavior, { ttl: 60_000 }])
 * export class GetUserHandler implements IQueryHandler<GetUserQuery> {}
 * ```
 *
 * @example Redis store
 * ```ts
 * CacheModule.forRoot({
 *   store: { type: 'redis', url: 'redis://localhost:6379' },
 *   ttl: 60_000,
 * })
 * ```
 *
 * @example Tiered memory + postgres store
 * ```ts
 * CacheModule.forRoot({
 *   store: [
 *     { type: 'memory', ttl: 5_000 },
 *     { type: 'postgres', url: 'postgresql://user:pass@localhost:5432/db' },
 *   ],
 * })
 * ```
 */
@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: static-only configuration class
export class CacheModule {
  /**
   * Registers the cache behavior, builds the cache instance, and binds optional
   * application-wide defaults.
   *
   * @param options - Store configuration and default behavior options.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRoot(options: CacheModuleOptions = {}): DynamicModule {
    const cache = buildCache(options);
    const defaults: CacheBehaviorOptions = {
      ...(options.ttl !== undefined ? { ttl: options.ttl } : {}),
      ...options.defaults,
    };

    return {
      module: CacheModule,
      global: true,
      providers: [
        CacheBehavior,
        {
          provide: PIPELINE_CACHE,
          useValue: cache,
        },
        {
          provide: CACHE_DEFAULT_OPTIONS,
          useValue: defaults,
        },
      ],
      exports: [CacheBehavior, PIPELINE_CACHE, CACHE_DEFAULT_OPTIONS],
    };
  }
}
