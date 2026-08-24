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

export {
  RATE_LIMIT_DEFAULT_OPTIONS,
  RATE_LIMITER,
} from './constants/tokens';
export { RateLimitExceededError } from './errors/rate-limit-exceeded.error';
export { RateLimitExceededFilter } from './filters/rate-limit-exceeded.filter';
export { buildRateLimitKey } from './helpers/build-key';
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
  RATE_LIMIT_KEY_ITEM,
  RateLimitBehavior,
} from './rate-limit.behavior';
export { RateLimitModule } from './rate-limit.module';
