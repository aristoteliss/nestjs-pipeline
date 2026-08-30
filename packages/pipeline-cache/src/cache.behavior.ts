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

import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
} from '@nestjs-pipeline/core';
import type { Cache } from 'cache-manager';
import { CACHE_DEFAULT_OPTIONS, PIPELINE_CACHE } from './constants/tokens';
import { defaultCacheKey } from './helpers/cache-key';
import type { CacheBehaviorOptions } from './interfaces/cache-options.interface';

/** Item key set on the pipeline context recording whether the request hit the cache. */
export const CACHE_HIT_ITEM = 'cache.hit';
/** Item key set on the pipeline context recording the resolved cache key. */
export const CACHE_KEY_ITEM = 'cache.key';

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
 * Only `query` requests are cached by default; commands and events pass through
 * untouched. On a cache miss, `null` / `undefined` results are not written.
 * Cache hits return the value from the single explicit lookup. This behavior
 * intentionally does not use `cache-manager.wrap()` because its background
 * refresh callback would re-enter every downstream pipeline behavior.
 * Store errors fail open by default: read failures bypass caching for that
 * execution, and write failures return the successful handler result. Set
 * `failOpen: false` to propagate store failures instead.
 */
@Injectable()
export class CacheBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;
  private readonly defaults: CacheBehaviorOptions;

  constructor(
    @Inject(PIPELINE_CACHE)
    private readonly cache: Cache,
    @Optional()
    @Inject(CACHE_DEFAULT_OPTIONS)
    defaults?: CacheBehaviorOptions,
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    this.defaults = defaults ?? {};

    if (!logger) {
      this.logger = new Logger(CacheBehavior.name, { timestamp: true });
      return;
    }

    this.logger = logger;
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options = this.resolveOptions(context);

    const kinds = options.kinds ?? DEFAULT_KINDS;
    if (!kinds.includes(context.requestKind)) return next();
    if (options.condition && !options.condition(context)) return next();

    const key = (options.key ?? defaultCacheKey)(context);
    context.items.set(CACHE_KEY_ITEM, key);

    let cached: unknown;
    try {
      cached = await this.cache.get(key);
    } catch (error) {
      this.handleStoreError('read', context, key, error, options);
      context.items.set(CACHE_HIT_ITEM, false);
      return next();
    }
    if (cached !== undefined && cached !== null) {
      context.items.set(CACHE_HIT_ITEM, true);
      this.logger.debug?.(
        `Cache hit for ${context.requestName} (${key})`,
        CacheBehavior.name,
      );
      return cached;
    }

    context.items.set(CACHE_HIT_ITEM, false);
    this.logger.debug?.(
      `Cache miss for ${context.requestName} (${key})`,
      CacheBehavior.name,
    );

    const result = await next();
    if (result !== undefined && result !== null) {
      try {
        await this.cache.set(key, result, options.ttl);
      } catch (error) {
        this.handleStoreError('write', context, key, error, options);
      }
    }

    return result;
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
      this.logger.warn?.(
        `Cache ${operation} error for ${context.requestName} ` +
          `(key: ${key}); failing open: ${message}`,
        CacheBehavior.name,
      );
      return;
    }

    this.logger.error?.(
      `Cache ${operation} error for ${context.requestName} ` +
        `(key: ${key}); failing closed: ${message}`,
      CacheBehavior.name,
    );
    throw error;
  }

  /** Shallow-merges per-handler options over the application defaults. */
  private resolveOptions(context: IPipelineContext): CacheBehaviorOptions {
    const handlerOptions =
      context.getBehaviorOptions<CacheBehaviorOptions>(CacheBehavior);
    if (!handlerOptions) return this.defaults;
    return { ...this.defaults, ...handlerOptions };
  }
}
