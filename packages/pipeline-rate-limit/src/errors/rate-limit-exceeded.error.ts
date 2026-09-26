/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Thrown by {@link RateLimitBehavior} when a request exceeds its allotted
 * points for the current window.
 *
 * Map it to HTTP `429 Too Many Requests` with {@link RateLimitExceededFilter},
 * which also emits a `Retry-After` header from {@link retryAfterSeconds}.
 */
export class RateLimitExceededError extends Error {
  /** The rate-limit bucket key that was exhausted. */
  readonly key: string;
  /** The request that was throttled, e.g. `CreateUserCommand`. */
  readonly requestName: string;
  /** Milliseconds until the caller may retry. */
  readonly msBeforeNext: number;
  /** Seconds until the caller may retry (rounded up), for `Retry-After`. */
  readonly retryAfterSeconds: number;
  /** Points remaining in the window (typically `0` here). */
  readonly remainingPoints: number;
  /** Configured point capacity per window, when known. */
  readonly limit?: number;
  /**
   * Points the rejected request asked for, when known. A request costing more
   * than {@link limit} can never pass, whatever the wait.
   */
  readonly points?: number;

  constructor(params: {
    key: string;
    requestName: string;
    msBeforeNext: number;
    remainingPoints: number;
    limit?: number;
    points?: number;
  }) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil(params.msBeforeNext / 1000),
    );
    super(
      `Rate limit exceeded for ${params.requestName} ` +
        `(key: ${params.key}); retry after ${retryAfterSeconds}s`,
    );
    this.name = 'RateLimitExceededError';
    this.key = params.key;
    this.requestName = params.requestName;
    this.msBeforeNext = params.msBeforeNext;
    this.retryAfterSeconds = retryAfterSeconds;
    this.remainingPoints = params.remainingPoints;
    this.limit = params.limit;
    this.points = params.points;
  }
}
