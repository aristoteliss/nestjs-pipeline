/* Copyright (C) 2026-present Aristotelis — see repository license. */

export { stableStringify } from '@nestjs-pipeline/core';
export {
  CacheManagerAdapter,
  type IPipelineCache,
} from './adapters/cache-manager.adapter';
export {
  CACHE_HIT_ITEM,
  CACHE_KEY_ITEM,
  CacheBehavior,
} from './cache.behavior';
export { CacheModule } from './cache.module';
export { CACHE_DEFAULT_OPTIONS, PIPELINE_CACHE } from './constants/tokens';
export {
  type CachePartitionDimension,
  MissingCachePartitionError,
} from './errors/missing-partition.error';
export { buildCache, buildKeyv } from './helpers/cache-factory';
export {
  createPartitionedCacheKeyFactory,
  type PartitionedCacheKeyOptions,
} from './helpers/cache-key';
export type {
  CacheBehaviorOptions,
  CacheCondition,
  CacheKeyFactory,
  CacheModuleOptions,
  CacheStoreConfig,
  CacheStoreType,
} from './interfaces/cache-options.interface';
