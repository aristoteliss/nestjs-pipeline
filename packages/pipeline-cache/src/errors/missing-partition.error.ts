/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingPartitionError } from '@nestjs-pipeline/core';

/** Which dimension of the cache key could not be resolved. */
export type CachePartitionDimension = 'tenant' | 'principal' | 'scope';

/**
 * Raised before the cache is consulted when a dimension required by the
 * configured key factory cannot be resolved.
 *
 * A cache hit returns without executing the handler,
 * so it also skips whatever entity-level authorization and field filtering that
 * handler performs. A key missing its tenant or principal segment therefore does
 * not merely lose isolation — it can replay one caller's authorized response to
 * another.
 */
export class MissingCachePartitionError extends MissingPartitionError<CachePartitionDimension> {
  override readonly name = 'MissingCachePartitionError';

  constructor(
    requestName: string,
    dimension: CachePartitionDimension,
    remedy: string,
  ) {
    super('Cache', requestName, dimension, remedy);
  }
}
