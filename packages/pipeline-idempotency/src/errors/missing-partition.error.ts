/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingPartitionError } from '@nestjs-pipeline/core';

/** Which dimension of the idempotency key could not be resolved. */
export type IdempotencyPartitionDimension =
  | 'tenant'
  | 'principal'
  | 'operation';

/**
 * Raised before a key is claimed when a dimension required by
 * {@link createPartitionedIdempotencyKeyFactory} cannot be resolved.
 *
 * Omitting a missing tenant or principal would
 * merge isolation domains: every caller whose identity could not be resolved
 * would share one deduplication namespace, so one caller's completed operation
 * could be replayed to another, or suppress another's first execution.
 */
export class MissingIdempotencyPartitionError extends MissingPartitionError<IdempotencyPartitionDimension> {
  override readonly name = 'MissingIdempotencyPartitionError';

  constructor(
    requestName: string,
    dimension: IdempotencyPartitionDimension,
    remedy: string,
  ) {
    super('Idempotency', requestName, dimension, remedy);
  }
}
