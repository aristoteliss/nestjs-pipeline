/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  CacheManagerAdapter,
  type IPipelineCache,
} from './adapters/cache-manager.adapter.js';
export {
  CACHE_HIT_ITEM,
  CACHE_HIT_ITEM_TOKEN,
  CACHE_KEY_ITEM,
  CACHE_KEY_ITEM_TOKEN,
  CacheBehavior,
} from './cache.behavior.js';
export { CacheModule } from './cache.module.js';
export { CACHE_DEFAULT_OPTIONS, PIPELINE_CACHE } from './constants/tokens.js';
export {
  type CachePartitionDimension,
  MissingCachePartitionError,
} from './errors/missing-partition.error.js';
export { buildCacheAttributes } from './helpers/build-attributes.js';
export {
  type CacheIntentOptions,
  cache,
} from './helpers/cache.intent.js';
export { buildCache, buildKeyv } from './helpers/cache-factory.js';
export {
  createPartitionedCacheKeyFactory,
  type PartitionedCacheKeyOptions,
} from './helpers/cache-key.js';
export type {
  CacheBehaviorOptions,
  CacheCondition,
  CacheKeyFactory,
  CacheModuleAsyncOptions,
  CacheModuleOptions,
  CacheStoreConfig,
  CacheStoreType,
} from './interfaces/cache-options.interface.js';
