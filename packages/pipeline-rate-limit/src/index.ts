/* Copyright (C) 2026-present Aristotelis — see repository license. */

export {
  RATE_LIMIT_DEFAULT_OPTIONS,
  RATE_LIMITER,
} from './constants/tokens';
export {
  MissingRateLimitPartitionError,
  type RateLimitPartitionDimension,
} from './errors/missing-partition.error';
export { RateLimitExceededError } from './errors/rate-limit-exceeded.error';
export { RateLimitExceededFilter } from './filters/rate-limit-exceeded.filter';
export { buildRateLimitKey } from './helpers/build-key';
export {
  createPartitionedRateLimitKeyFactory,
  type PartitionedRateLimitKeyOptions,
  type RateLimitPartitionFactory,
} from './helpers/partitioned-key';
export {
  type RateLimitIntentOptions,
  rateLimit,
} from './helpers/rate-limit.intent';
export type {
  RateLimitBehaviorOptions,
  RateLimitKeyFactory,
  RateLimitModuleAsyncOptions,
  RateLimitModuleOptions,
} from './interfaces/rate-limit-options.interface';
export type {
  RateLimiterLike,
  RateLimiterResLike,
} from './interfaces/rate-limiter.interface';
export {
  RATE_LIMIT_ITEM,
  RATE_LIMIT_ITEM_TOKEN,
  RATE_LIMIT_KEY_ITEM,
  RATE_LIMIT_KEY_ITEM_TOKEN,
  RateLimitBehavior,
} from './rate-limit.behavior';
export { RateLimitModule } from './rate-limit.module';
