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

/**
 * Minimal structural shape of a `rate-limiter-flexible` result
 * (`RateLimiterRes`). Declared locally so this package does not hard-depend on
 * `rate-limiter-flexible` — a real result satisfies it.
 */
export interface RateLimiterResLike {
  /** Milliseconds until the next point(s) become available. */
  msBeforeNext: number;
  /** Points remaining in the current window after this consumption. */
  remainingPoints: number;
  /** Points consumed so far in the current window. */
  consumedPoints: number;
  /** Whether this consumption started a fresh window. */
  isFirstInDuration: boolean;
}

/**
 * Minimal structural shape of a `rate-limiter-flexible` limiter
 * (`RateLimiterAbstract`). Any of its backends —
 * `RateLimiterMemory`, `RateLimiterRedis`, `RateLimiterMongo`,
 * `RateLimiterPostgres`, `RateLimiterMySQL`, … — satisfies this interface, so
 * they are genuine drop-in replacements. Add it in your app:
 * `pnpm add rate-limiter-flexible`.
 */
export interface RateLimiterLike {
  /**
   * Consume `points` (default `1`) for `key`. Resolves with the updated
   * {@link RateLimiterResLike} when allowed, or **rejects** with a
   * {@link RateLimiterResLike} when the limit is exceeded (and with a plain
   * `Error` when the backing store itself fails).
   */
  consume(key: string, points?: number): Promise<RateLimiterResLike>;
  /** The configured point capacity per window, when the limiter exposes it. */
  readonly points?: number;
}
