/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Which dimension of the bucket key could not be resolved. */
export type RateLimitPartitionDimension = 'tenant' | 'caller';

/**
 * Raised before the limiter is consumed when a dimension required by the
 * configured key factory cannot be resolved; omitting the segment instead would
 * put every unresolved caller into one shared bucket.
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
