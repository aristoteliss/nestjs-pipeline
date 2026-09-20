/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Options applied to one cache write. */
export interface CacheSetOptions {
  /** Entry lifetime in milliseconds. Adapter-specific semantics apply when omitted. */
  ttl?: number;

  /**
   * Atomic stale-write guard. When the adapter can compare an existing value
   * with the incoming value, returning `true` means the cached value is newer
   * and must not be overwritten.
   *
   * {@link isCacheNewer} is the standard comparator for versioned snapshots.
   */
  isNewer?: (cached: unknown, incoming: unknown) => boolean;
}

/**
 * Minimal cache port used by DDD repository decorators.
 *
 * Implementations must store detached/serializable snapshots rather than live
 * domain aggregates. `set()` may additionally implement compare-and-set
 * semantics through {@link CacheSetOptions.isNewer}.
 *
 * @typeParam T - Value shape stored by this cache adapter.
 *
 * @example
 * ```ts
 * const cached = await cache.get(userKey);
 * await cache.set(userKey, user.toJSON(), {
 *   ttl: 30_000,
 *   isNewer: isCacheNewer,
 * });
 * await cache.delete(userKey);
 * ```
 */
export interface ICache<T = unknown> {
  /** Returns the cached value, or `undefined` when the key is absent. */
  get(key: string): Promise<T | undefined>;

  /** Writes a value under `key`, optionally with TTL/CAS semantics. */
  set(key: string, value: T, options?: CacheSetOptions): Promise<void>;

  /** Removes `key` when present. */
  delete(key: string): Promise<void>;
}

/** Cache entry observation state. */
export type CacheStateStatus = 'hit' | 'miss' | 'expired';

/**
 * Observed state of a cache key including opaque revision fencing.
 *
 * @typeParam T - Value shape stored by this cache adapter.
 */
export interface CacheStateEntry<T = unknown> {
  /**
   * Status of the cache entry:
   * - `'hit'`: Value is present and unexpired.
   * - `'miss'`: Key is absent or was invalidated.
   * - `'expired'`: Entry existed but its TTL has elapsed.
   */
  readonly status: CacheStateStatus;

  /** The cached value when status is `'hit'`, otherwise `undefined`. */
  readonly value?: T;

  /**
   * Opaque revision token associated with the key at the moment of inspection.
   * Advances on every write or invalidation, and is preserved on payload expiry
   * to eliminate ABA races during fill attempts.
   */
  readonly revision: string;
}

/**
 * Options for revision-fenced cache fill attempts.
 */
export interface CacheFillOptions {
  /** Entry lifetime in milliseconds. */
  ttl?: number;
}

/**
 * Extended cache port providing atomic revision-fenced state operations.
 *
 * Guarantees per-key ordering: a fill started before an observed invalidation
 * cannot repopulate its key afterwards.
 *
 * @typeParam T - Value shape stored by this cache adapter.
 */
export interface IVersionedCache<T = unknown> extends ICache<T> {
  readonly isVersioned: true;

  /**
   * Observes current key state and opaque revision token.
   */
  readState(key: string): Promise<CacheStateEntry<T>>;

  /**
   * Atomically advances the key revision and evicts the value.
   *
   * @returns The newly advanced revision.
   */
  invalidate(key: string): Promise<string>;

  /**
   * Atomically checks that current revision matches `observedRevision`, writes
   * value, and advances revision on match.
   *
   * @returns `true` if write committed; `false` if rejected due to revision mismatch.
   */
  tryFill(
    key: string,
    observedRevision: string,
    value: T,
    options?: CacheFillOptions,
  ): Promise<boolean>;
}

/**
 * Capability guard verifying whether an adapter supports versioned coordination.
 */
export function isVersionedCache<T = unknown>(
  cache: unknown,
): cache is IVersionedCache<T> {
  return (
    typeof cache === 'object' &&
    cache !== null &&
    (('isVersioned' in cache &&
      (cache as IVersionedCache<T>).isVersioned === true) ||
      (typeof (cache as IVersionedCache<T>).readState === 'function' &&
        typeof (cache as IVersionedCache<T>).invalidate === 'function' &&
        typeof (cache as IVersionedCache<T>).tryFill === 'function'))
  );
}
