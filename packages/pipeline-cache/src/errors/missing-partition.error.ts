/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Which dimension of the cache key could not be resolved. */
export type CachePartitionDimension = 'tenant' | 'principal' | 'scope';

/**
 * Raised before the cache is consulted when a dimension required by the
 * configured key factory cannot be resolved.
 *
 * Failing here is the point. A cache hit returns without executing the handler,
 * so it also skips whatever entity-level authorization and field filtering that
 * handler performs. A key missing its tenant or principal segment therefore does
 * not merely lose isolation — it can replay one caller's authorized response to
 * another.
 */
export class MissingCachePartitionError extends Error {
  override readonly name = 'MissingCachePartitionError';

  constructor(
    public readonly requestName: string,
    public readonly dimension: CachePartitionDimension,
    public readonly remedy: string,
  ) {
    super(
      `Cache key for ${requestName} requires a ${dimension} partition, which could not be resolved. ${remedy}`,
    );
  }
}
