/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  RATE_LIMIT_DEFAULT_OPTIONS,
  RATE_LIMITER,
} from './constants/tokens.js';
export {
  MissingRateLimitPartitionError,
  type RateLimitPartitionDimension,
} from './errors/missing-partition.error.js';
export { RateLimitExceededError } from './errors/rate-limit-exceeded.error.js';
export { RateLimitExceededFilter } from './filters/rate-limit-exceeded.filter.js';
export { buildRateLimitAttributes } from './helpers/build-attributes.js';
export { buildRateLimitKey } from './helpers/build-key.js';
export {
  createPartitionedRateLimitKeyFactory,
  type PartitionedRateLimitKeyOptions,
  type RateLimitPartitionFactory,
} from './helpers/partitioned-key.js';
export {
  type RateLimitIntentOptions,
  rateLimit,
} from './helpers/rate-limit.intent.js';
export type {
  RateLimitBehaviorOptions,
  RateLimitCostFactory,
  RateLimitKeyFactory,
  RateLimitModuleAsyncOptions,
  RateLimitModuleOptions,
} from './interfaces/rate-limit-options.interface.js';
export type {
  RateLimiterLike,
  RateLimiterResLike,
} from './interfaces/rate-limiter.interface.js';
export {
  RATE_LIMIT_ITEM,
  RATE_LIMIT_ITEM_TOKEN,
  RATE_LIMIT_KEY_ITEM,
  RATE_LIMIT_KEY_ITEM_TOKEN,
  RateLimitBehavior,
} from './rate-limit.behavior.js';
export { RateLimitModule } from './rate-limit.module.js';
