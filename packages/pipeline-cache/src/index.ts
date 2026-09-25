/* Copyright (C) 2026-present Aristotelis — see repository license. */

export { stableStringify } from '@cqrs-ddd/safe-stringify';
export {
  CacheManagerAdapter,
  type IPipelineCache,
} from './adapters/cache-manager.adapter';
export {
  CACHE_HIT_ITEM,
  CACHE_HIT_ITEM_TOKEN,
  CACHE_KEY_ITEM,
  CACHE_KEY_ITEM_TOKEN,
  CacheBehavior,
} from './cache.behavior';
export { CacheModule } from './cache.module';
export { CACHE_DEFAULT_OPTIONS, PIPELINE_CACHE } from './constants/tokens';
export {
  type CachePartitionDimension,
  MissingCachePartitionError,
} from './errors/missing-partition.error';
export {
  type CacheIntentOptions,
  cache,
} from './helpers/cache.intent';
export { buildCache, buildKeyv } from './helpers/cache-factory';
export {
  createPartitionedCacheKeyFactory,
  type PartitionedCacheKeyOptions,
} from './helpers/cache-key';
export type {
  CacheBehaviorOptions,
  CacheCondition,
  CacheKeyFactory,
  CacheModuleAsyncOptions,
  CacheModuleOptions,
  CacheStoreConfig,
  CacheStoreType,
} from './interfaces/cache-options.interface';
