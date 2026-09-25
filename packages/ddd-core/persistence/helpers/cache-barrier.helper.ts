/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { uuidv7 } from '@cqrs-ddd/uuidv7';

/**
 * Mutation reason associated with a {@link CacheMutationBarrier}.
 */
export type CacheBarrierReason = 'deleted' | 'invalidated';

/**
 * Sentinel marker installed in cache during mutations (deletion or invalidation)
 * to record that a cache key changed while a concurrent read may have been in flight.
 *
 * {@link FromCache} treats a barrier as a miss, never as a snapshot. The
 * protection against stale data comes from {@link isCacheNewer}, the default
 * `isNewer` of the {@link Cache} write-through: it ranks a barrier above any
 * snapshot, so a write-through that started before the mutation cannot
 * overwrite it.
 */
export interface CacheMutationBarrier {
  readonly __cacheBarrier: true;

  /**
   * Unique per barrier (UUIDv7); diagnostic only.
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
 * await cache.set(key, barrier, { ttl: DEFAULT_BARRIER_TTL_MS });
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
 *   // Barrier encountered; treat as a miss
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
