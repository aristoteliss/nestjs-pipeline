/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { uuidv7 } from '@nestjs-pipeline/core';

/**
 * Mutation reason associated with a {@link CacheMutationBarrier}.
 */
export type CacheBarrierReason = 'deleted' | 'invalidated';

/**
 * Sentinel marker installed in cache during mutations (deletion or invalidation)
 * to record that a cache key changed while a concurrent read may have been in flight.
 *
 * Unlike deletion tombstones, mutation barriers:
 * - Do NOT mean "entity does not exist" generically (which would corrupt secondary invalidations).
 * - Carry a unique UUID v7 `token` to detect intermediate mutations and ABA sequences.
 * - Signal to {@link FromCache} that any database query that started before this barrier must
 *   not repopulate the cache with stale data.
 */
export interface CacheMutationBarrier {
  readonly __cacheBarrier: true;

  /**
   * Unique identifier for this mutation event.
   * Changes monotonically/uniquely for every mutation to detect ABA sequences.
   */
  readonly token: string;

  /**
   * Reason for the barrier installation.
   */
  readonly reason: CacheBarrierReason;

  /**
   * Epoch timestamp when the barrier was installed.
   */
  readonly createdAt: number;

  /**
   * Diagnostic aggregate identifier if available on the mutated entity.
   */
  readonly aggregateId?: string;

  /**
   * Diagnostic version number if available on the mutated entity.
   */
  readonly version?: number;
}

/**
 * Union representing values persisted in the cache infrastructure layer.
 *
 * Application query handlers receive strictly domain aggregates; this union
 * is managed entirely within the cache decorator and repository boundary.
 */
export type CacheStoredValue<TSnapshot> = TSnapshot | CacheMutationBarrier;

/**
 * Factory creating a new {@link CacheMutationBarrier} with a unique token.
 *
 * @param reason - Whether the barrier represents an entity deletion or secondary invalidation.
 * @param entity - Optional entity or snapshot providing diagnostic id or version metadata.
 * @returns Pure serializable {@link CacheMutationBarrier}.
 *
 * @example
 * ```typescript
 * const barrier = createCacheMutationBarrier('deleted', user);
 * await cache.set(key, barrier, { ttl: 0 });
 * ```
 */
export function createCacheMutationBarrier(
  reason: CacheBarrierReason,
  entity?: unknown,
): CacheMutationBarrier {
  const e =
    typeof entity === 'object' && entity !== null
      ? (entity as Record<string, unknown>)
      : undefined;

  const aggregateId = typeof e?.id === 'string' ? e.id : undefined;
  const version =
    typeof e?.version === 'number'
      ? e.version
      : typeof (e as { _version?: unknown })?._version === 'number'
        ? ((e as { _version: number })._version as number)
        : undefined;

  return {
    __cacheBarrier: true,
    token: uuidv7(),
    reason,
    createdAt: Date.now(),
    ...(aggregateId !== undefined ? { aggregateId } : {}),
    ...(version !== undefined ? { version } : {}),
  };
}

/**
 * Type guard verifying whether an arbitrary value is a {@link CacheMutationBarrier}.
 *
 * @param value - Candidate value retrieved from cache.
 * @returns `true` if value is a {@link CacheMutationBarrier}, `false` otherwise.
 *
 * @example
 * ```typescript
 * if (isCacheMutationBarrier(cached)) {
 *   // Barrier encountered; bypass cache and verify against barrier token
 * }
 * ```
 */
export function isCacheMutationBarrier(
  value: unknown,
): value is CacheMutationBarrier {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).__cacheBarrier === true
  );
}
