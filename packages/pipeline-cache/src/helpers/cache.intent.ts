/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@nestjs-pipeline/core';
import { CacheBehavior } from '../cache.behavior';
import type { CacheBehaviorOptions } from '../interfaces/cache-options.interface';

export type CacheIntentOptions = Omit<CacheBehaviorOptions, 'key'> &
  (
    | {
        key: NonNullable<CacheBehaviorOptions['key']>;
        inheritModuleKey?: never;
      }
    | { inheritModuleKey: true; key?: never }
  );

/**
 * Returns a cache behavior entry for `@UsePipeline`.
 * @param options A key factory and cache options, or `inheritModuleKey: true`
 * when the module supplies the key factory. The inheritance marker is not
 * forwarded to the behavior and does not validate module configuration.
 * @returns The behavior class and options tuple.
 * Keys for authorized responses must separate tenant, principal and permission
 * scope; prefer `createPartitionedCacheKeyFactory` for those responses.
 * @example
 * ```ts
 * @UsePipeline(cache({ key: userCacheKey, ttl: 30_000 }))
 * @UsePipeline(cache({ inheritModuleKey: true, ttl: 30_000 }))
 * ```
 */
export function cache(
  options: CacheIntentOptions,
): PipelineBehaviorTuple<CacheBehavior, CacheBehaviorOptions> {
  const { inheritModuleKey: _inheritModuleKey, ...behaviorOptions } = options;
  return [CacheBehavior, behaviorOptions];
}
