/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Raised when a partitioned key (cache, idempotency, rate limit) needs a
 * dimension, such as the tenant or the principal, that could not be resolved.
 * Omitting it instead would merge isolation domains: callers whose identity
 * is unknown would share one key.
 *
 * Each package subclasses it with its own name and dimensions, such as
 * `MissingCachePartitionError`.
 *
 * @example
 * ```ts
 * export class MissingCachePartitionError extends MissingPartitionError<'tenant' | 'principal'> {
 *   override readonly name = 'MissingCachePartitionError';
 *
 *   constructor(requestName: string, dimension: 'tenant' | 'principal', remedy: string) {
 *     super('Cache', requestName, dimension, remedy);
 *   }
 * }
 * ```
 */
export abstract class MissingPartitionError<
  TDimension extends string = string,
> extends Error {
  protected constructor(
    keyKind: string,
    public readonly requestName: string,
    public readonly dimension: TDimension,
    public readonly remedy: string,
  ) {
    super(
      `${keyKind} key for ${requestName} requires a ${dimension} partition, which could not be resolved. ${remedy}`,
    );
  }
}
