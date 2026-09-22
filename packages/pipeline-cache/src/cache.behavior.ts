/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import {
  createPipelineItem,
  type IPipelineBehavior,
  type IPipelineBehaviorContract,
  type IPipelineBehaviorOptionsResolver,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
  PIPELINE_BEHAVIOR_CONTRACT,
  type PipelineBehaviorDiagnostic,
  type PipelineBehaviorOrderRule,
  type PipelineBehaviorValidationContext,
  type PipelineItemToken,
  setPipelineItem,
} from '@nestjs-pipeline/core';
import type { Cache } from 'cache-manager';
import {
  CacheManagerAdapter,
  type IPipelineCache,
} from './adapters/cache-manager.adapter';
import { CACHE_DEFAULT_OPTIONS, PIPELINE_CACHE } from './constants/tokens';
import type { CacheBehaviorOptions } from './interfaces/cache-options.interface';

/**
 * Unique symbol key set on `context.items` recording whether the request was served from cache (`true` on hit).
 *
 * @example
 * ```ts
 * const isHit = context.items.get(CACHE_HIT_ITEM) === true;
 * ```
 */
export const CACHE_HIT_ITEM = Symbol('CACHE_HIT_ITEM');

/**
 * Typed token for {@link CACHE_HIT_ITEM}: the cache hit flag. Reads and writes the same
 * `context.items` entry through `getPipelineItem` / `requirePipelineItem`.
 */
export const CACHE_HIT_ITEM_TOKEN: PipelineItemToken<boolean> =
  createPipelineItem<boolean>('CACHE_HIT_ITEM', CACHE_HIT_ITEM);

/**
 * Unique symbol key set on `context.items` recording the resolved cache key string.
 *
 * @example
 * ```ts
 * const key = context.items.get(CACHE_KEY_ITEM) as string | undefined;
 * ```
 */
export const CACHE_KEY_ITEM = Symbol('CACHE_KEY_ITEM');

/**
 * Typed token for {@link CACHE_KEY_ITEM}: the resolved cache key. Reads and writes the same
 * `context.items` entry through `getPipelineItem` / `requirePipelineItem`.
 */
export const CACHE_KEY_ITEM_TOKEN: PipelineItemToken<string> =
  createPipelineItem<string>('CACHE_KEY_ITEM', CACHE_KEY_ITEM);

const DEFAULT_KINDS: Array<IPipelineContext['requestKind']> = ['query'];

/**
 * Pipeline behavior that transparently caches handler results with
 * `cache-manager` (v7) on top of Keyv.
 *
 * Resolution of the effective options for a handler:
 * 1. Application-wide defaults bound to {@link CACHE_DEFAULT_OPTIONS}
 *    (via {@link CacheModule.forRoot}).
 * 2. Per-handler options from `@UsePipeline([CacheBehavior, { ... }])`,
 *    shallow-merged on top of the defaults (handler keys win).
 *
 * A `key` factory is required — see {@link createPartitionedCacheKeyFactory}. Only
 * `query` requests are cached by default; commands and events pass through
 * untouched. On a cache miss, `null` / `undefined` results are not written.
 * Cache hits return the value from the single explicit lookup. This behavior
 * intentionally does not use `cache-manager.wrap()` because its background
 * refresh callback would re-enter every downstream pipeline behavior.
 * Cached results are JSON values. A miss returns the JSON form of the handler
 * result that it stores (a `Date` becomes an ISO string and a class instance a
 * plain object), so a hit and a miss return the same shape. A result that cannot
 * be JSON-serialized is returned unchanged and not cached.
 *
 * Store errors fail open by default: read failures bypass caching for that
 * execution, and write failures return the successful handler result. Set
 * `failOpen: false` to propagate store failures instead.
 *
 * @example Principal/permission-scoped query cache
 * ```ts
 * const userCacheKey = createPartitionedCacheKeyFactory({
 *   principal: (ctx) => ctx.items.get('userId') as string | undefined,
 *   scope: (ctx) => ctx.items.get('capabilityVersion') as string | undefined,
 * });
 *
 * @QueryHandler(GetUsersQuery)
 * @UsePipeline([CacheBehavior, { key: userCacheKey, ttl: 30_000 }])
 * export class GetUsersHandler {}
 * ```
 */
@Injectable()
export class CacheBehavior
  implements
    IPipelineBehavior,
    IPipelineBehaviorOptionsResolver<CacheBehaviorOptions>
{
  static readonly [PIPELINE_BEHAVIOR_CONTRACT]: IPipelineBehaviorContract = {
    order: (
      context: PipelineBehaviorValidationContext,
    ): PipelineBehaviorOrderRule | undefined => {
      const options = context.effectiveOptions as
        | CacheBehaviorOptions
        | undefined;
      const kinds = options?.kinds ?? DEFAULT_KINDS;
      if (!kinds.includes(context.requestKind)) {
        return undefined;
      }
      return {
        after: ['@nestjs-pipeline/casl:CaslBehavior', 'CaslBehavior'],
      };
    },
    validate: (
      context: PipelineBehaviorValidationContext,
    ): PipelineBehaviorDiagnostic[] | undefined => {
      const options = context.effectiveOptions as
        | CacheBehaviorOptions
        | undefined;
      const kinds = options?.kinds ?? DEFAULT_KINDS;
      if (!kinds.includes(context.requestKind)) {
        return undefined;
      }

      if (!options?.key) {
        return [
          {
            handlerName: context.handlerName,
            behaviorName: CacheBehavior.name,
            message: 'Active CacheBehavior requires an explicit `key` factory',
            fix:
              'Provide a key factory via createPartitionedCacheKeyFactory(...) or ' +
              'cacheKeyTemplate(...) in @UsePipeline([CacheBehavior, { key: ... }]) or CacheModule.forRoot({ defaults: ... }).',
          },
        ];
      }

      if (typeof options.key !== 'function') {
        return [
          {
            handlerName: context.handlerName,
            behaviorName: CacheBehavior.name,
            message: `CacheBehavior key factory must be a callable function, received ${typeof options.key}`,
            fix: 'Pass a valid function (ctx) => string to the key option in @UsePipeline([CacheBehavior, { key: ... }]).',
          },
        ];
      }

      return undefined;
    },
  };

  private readonly logger: LoggerService;
  private readonly defaults: CacheBehaviorOptions;
  private readonly cacheAdapter: IPipelineCache;

  constructor(
    @Inject(PIPELINE_CACHE)
    cache: Cache | IPipelineCache,
    @Optional()
    @Inject(CACHE_DEFAULT_OPTIONS)
    defaults?: CacheBehaviorOptions,
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    this.defaults = defaults ?? {};
    this.cacheAdapter =
      cache instanceof CacheManagerAdapter
        ? cache
        : new CacheManagerAdapter(cache as Cache);

    this.logger = logger ?? new Logger(CacheBehavior.name, { timestamp: true });
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options = this.resolveEffectiveOptions(
      context.getBehaviorOptions<CacheBehaviorOptions>(CacheBehavior),
    );

    const kinds = options.kinds ?? DEFAULT_KINDS;
    if (!kinds.includes(context.requestKind)) return next();
    if (options.condition && !options.condition(context)) return next();

    if (!options.key) {
      throw new TypeError(
        `CacheBehavior on ${context.handlerName} requires an explicit \`key\` factory. ` +
          'A cache hit returns without running the handler, so the key must partition ' +
          'every dimension that can change the authorized response: tenant, principal, ' +
          'permission scope and request payload. Use createPartitionedCacheKeyFactory(...).',
      );
    }

    const key = options.key(context);
    setPipelineItem(context, CACHE_KEY_ITEM_TOKEN, key);

    let cached: unknown;
    let canWrite = true;
    try {
      cached = await this.cacheAdapter.get(key);
    } catch (error) {
      this.handleStoreError('read', context, key, error, options);
      canWrite = false;
    }
    if (cached !== undefined && cached !== null) {
      setPipelineItem(context, CACHE_HIT_ITEM_TOKEN, true);
      this.diagnose('debug', `Cache hit for ${context.requestName} (${key})`);
      return cached;
    }

    setPipelineItem(context, CACHE_HIT_ITEM_TOKEN, false);
    this.diagnose('debug', `Cache miss for ${context.requestName} (${key})`);

    const result = await next();
    if (result === undefined || result === null) return result;

    const cacheable = toJsonForm(result);
    if (cacheable === undefined) {
      this.diagnose(
        'warn',
        `Result of ${context.requestName} is not JSON-serializable; not cached (key: ${key})`,
      );
      return result;
    }

    if (canWrite) {
      try {
        await this.cacheAdapter.set(key, cacheable, options.ttl);
      } catch (error) {
        this.handleStoreError('write', context, key, error, options);
      }
    }
    return cacheable;
  }

  /** Logs a store failure and either bypasses it or propagates it. */
  private handleStoreError(
    operation: 'read' | 'write',
    context: IPipelineContext,
    key: string,
    error: unknown,
    options: CacheBehaviorOptions,
  ): void {
    const message = error instanceof Error ? error.message : String(error);

    if (options.failOpen ?? true) {
      this.diagnose(
        'warn',
        `Cache ${operation} error for ${context.requestName} ` +
          `(key: ${key}); failing open: ${message}`,
      );
      return;
    }

    this.diagnose(
      'error',
      `Cache ${operation} error for ${context.requestName} ` +
        `(key: ${key}); failing closed: ${message}`,
    );
    throw error;
  }

  private diagnose(level: 'debug' | 'warn' | 'error', message: string): void {
    try {
      this.logger[level]?.(message, CacheBehavior.name);
    } catch {
      // Diagnostics must not replace the handler result or cache-store error.
    }
  }

  /** Shallow-merges pipeline-level options over application defaults. */
  resolveEffectiveOptions(
    options?: CacheBehaviorOptions,
  ): CacheBehaviorOptions {
    if (!options) return this.defaults;
    return { ...this.defaults, ...options };
  }
}

/** JSON round-trip of a cacheable result, or `undefined` when it has no JSON form. */
function toJsonForm(value: unknown): unknown {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? undefined : JSON.parse(json);
  } catch {
    return undefined;
  }
}
