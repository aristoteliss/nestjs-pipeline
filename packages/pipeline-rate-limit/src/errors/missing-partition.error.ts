/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Which dimension of the bucket key could not be resolved. */
export type RateLimitPartitionDimension = 'tenant' | 'caller';

/**
 * Raised before the limiter is consumed when a dimension required by the
 * configured key factory cannot be resolved.
 *
 * Failing here is deliberate. The alternative — omitting the missing segment —
 * silently merges isolation domains: every caller whose identity could not be
 * resolved would share one bucket, so one of them can exhaust the quota for all
 * the others. A configuration error at the first request is cheaper than a
 * shared-fate limiter discovered in production.
 */
export class MissingRateLimitPartitionError extends Error {
  override readonly name = 'MissingRateLimitPartitionError';

  constructor(
    public readonly requestName: string,
    public readonly dimension: RateLimitPartitionDimension,
    public readonly remedy: string,
  ) {
    super(
      `Rate-limit key for ${requestName} requires a ${dimension} partition, which could not be resolved. ${remedy}`,
    );
  }
}
