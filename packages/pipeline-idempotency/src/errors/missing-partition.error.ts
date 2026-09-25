/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
export class MissingIdempotencyPartitionError extends Error {
  override readonly name = 'MissingIdempotencyPartitionError';

  constructor(
    public readonly requestName: string,
    public readonly dimension: IdempotencyPartitionDimension,
    public readonly remedy: string,
  ) {
    super(
      `Idempotency key for ${requestName} requires a ${dimension} partition, which could not be resolved. ${remedy}`,
    );
  }
}
