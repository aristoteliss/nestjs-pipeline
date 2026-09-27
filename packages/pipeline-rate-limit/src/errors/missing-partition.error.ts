/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingPartitionError } from '@nestjs-pipeline/core';

/** Which dimension of the bucket key could not be resolved. */
export type RateLimitPartitionDimension = 'tenant' | 'caller';

/**
 * Raised before the limiter is consumed when a dimension required by the
 * configured key factory cannot be resolved; omitting the segment instead would
 * put every unresolved caller into one shared bucket.
 */
export class MissingRateLimitPartitionError extends MissingPartitionError<RateLimitPartitionDimension> {
  override readonly name = 'MissingRateLimitPartitionError';

  constructor(
    requestName: string,
    dimension: RateLimitPartitionDimension,
    remedy: string,
  ) {
    super('Rate-limit', requestName, dimension, remedy);
  }
}
