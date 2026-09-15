/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** DI token for the {@link RateLimiterLike} backing the behavior. */
export const RATE_LIMITER = Symbol('RATE_LIMITER');

/** DI token for the module-wide default {@link RateLimitBehaviorOptions}. */
export const RATE_LIMIT_DEFAULT_OPTIONS = Symbol('RATE_LIMIT_DEFAULT_OPTIONS');
