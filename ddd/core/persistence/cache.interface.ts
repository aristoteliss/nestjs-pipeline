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
