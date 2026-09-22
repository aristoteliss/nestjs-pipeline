/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type DynamicModule,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnApplicationShutdown,
  type Provider,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { CacheBehavior } from './cache.behavior';
import {
  CACHE_DEFAULT_OPTIONS,
  CACHE_MODULE_OPTIONS,
  PIPELINE_CACHE,
} from './constants/tokens';
import { buildCache } from './helpers/cache-factory';
import type {
  CacheBehaviorOptions,
  CacheModuleAsyncOptions,
  CacheModuleOptions,
} from './interfaces/cache-options.interface';

const logger = new Logger('CacheModule');

function storeLabel(options: CacheModuleOptions): string {
  if (options.cache) return 'custom-cache';
  if (options.stores && options.stores.length > 0) return 'custom-stores';
  if (!options.store) return 'memory';
  return Array.isArray(options.store)
    ? options.store.map((s) => s.type).join(', ')
    : options.store.type;
}

/** The module owns, and closes, only a cache it built from declarative options. */
function ownsCache(options: CacheModuleOptions): boolean {
  return !options.cache && !(options.stores && options.stores.length > 0);
}

@Injectable()
class CacheConnectionLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(PIPELINE_CACHE) private readonly cache: Cache,
    @Inject(CACHE_MODULE_OPTIONS) private readonly options: CacheModuleOptions,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    if (ownsCache(this.options)) await this.cache.disconnect();
  }
}

function cacheProviders(optionsProvider: Provider): Provider[] {
  return [
    optionsProvider,
    CacheBehavior,
    {
      provide: PIPELINE_CACHE,
      useFactory: (options: CacheModuleOptions) => {
        const cache = buildCache(options);
        logger.log(`Initialized cache with [${storeLabel(options)}] store`);
        return cache;
      },
      inject: [CACHE_MODULE_OPTIONS],
    },
    {
      provide: CACHE_DEFAULT_OPTIONS,
      useFactory: (options: CacheModuleOptions): CacheBehaviorOptions => ({
        ...(options.ttl !== undefined ? { ttl: options.ttl } : {}),
        ...options.defaults,
      }),
      inject: [CACHE_MODULE_OPTIONS],
    },
    CacheConnectionLifecycle,
  ];
}

const CACHE_EXPORTS = [CacheBehavior, PIPELINE_CACHE, CACHE_DEFAULT_OPTIONS];

/**
 * NestJS module that builds the shared `cache-manager` instance, registers the
 * {@link CacheBehavior}, and (optionally) application-wide default
 * {@link CacheBehaviorOptions}.
 *
 * The store backend is selected declaratively (memory, redis, memcache,
 * sqlite, postgres) or supplied directly as a pre-built cache / Keyv stores.
 * The cache is built when the application instantiates its providers, once per
 * application. A cache built from `store` (or the default memory store) is
 * disconnected on application shutdown; a supplied `cache` or `stores` belongs
 * to the caller, who closes it.
 *
 * @example In-memory cache (default), per-handler configuration
 * ```ts
 * import {
 *   CacheBehavior,
 *   CacheModule,
 *   createPartitionedCacheKeyFactory,
 * } from '@nestjs-pipeline/cache';
 *
 * @Module({
 *   imports: [
 *     CacheModule.forRoot({ ttl: 30_000 }),
 *     PipelineModule.forRoot({ behaviors: [CacheBehavior] }),
 *   ],
 * })
 * export class AppModule {}
 *
 * const userQueryKey = createPartitionedCacheKeyFactory({
 *   principal: (ctx) => ctx.items.get('userId') as string | undefined,
 *   scope: (ctx) => ctx.items.get('capabilityVersion') as string | undefined,
 * });
 *
 * @QueryHandler(GetUserQuery)
 * @UsePipeline([CacheBehavior, { key: userQueryKey, ttl: 60_000 }])
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
export class CacheModule {
  /**
   * Registers the cache behavior, the cache instance, and optional
   * application-wide defaults.
   *
   * @param options - Store configuration and default behavior options.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRoot(options: CacheModuleOptions = {}): DynamicModule {
    return {
      module: CacheModule,
      global: true,
      providers: cacheProviders({
        provide: CACHE_MODULE_OPTIONS,
        useValue: options,
      }),
      exports: CACHE_EXPORTS,
    };
  }

  /**
   * Registers the cache behavior with options resolved from injected
   * dependencies (for example configuration read at startup).
   *
   * @example
   * ```ts
   * CacheModule.forRootAsync({
   *   inject: [ConfigService],
   *   useFactory: (config: ConfigService) => ({
   *     store: { type: 'redis', url: config.getOrThrow('REDIS_URL') },
   *     ttl: 30_000,
   *   }),
   * });
   * ```
   */
  static forRootAsync(options: CacheModuleAsyncOptions): DynamicModule {
    return {
      module: CacheModule,
      global: true,
      imports: options.imports ?? [],
      providers: cacheProviders({
        provide: CACHE_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      }),
      exports: CACHE_EXPORTS,
    };
  }
}
