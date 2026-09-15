/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { isCacheMutationBarrier } from './cache-barrier.helper';

/**
 * Checks whether a cached snapshot or record is strictly newer than an incoming
 * record based on explicit version numbers, generation counters, or updatedAt timestamps.
 *
 * Returns `true` only if `cached` is strictly newer than `incoming`.
 * Returns `false` if `incoming` is newer, equal, or if no meaningful ordering can be determined.
 *
 * Comparison precedence:
 * 1. Numeric `version` (optimistic concurrency version)
 * 2. Numeric `__gen` (generation sequence counter)
 * 3. `updatedAt` (Date instance or ISO 8601 string / timestamp)
 *
 * @example Comparing versioned aggregate snapshots
 * ```typescript
 * isCacheNewer({ id: '1', version: 3 }, { id: '1', version: 2 }); // true
 * isCacheNewer({ id: '1', version: 2 }, { id: '1', version: 3 }); // false
 * isCacheNewer({ id: '1', version: 2 }, { id: '1', version: 2 }); // false
 * ```
 *
 * @param cached - The existing data in cache.
 * @param incoming - The incoming data being written or compared.
 * @returns `true` if `cached` is strictly newer than `incoming`, `false` otherwise.
 */
export function isCacheNewer(cached: unknown, incoming: unknown): boolean {
  if (
    !cached ||
    typeof cached !== 'object' ||
    !incoming ||
    typeof incoming !== 'object' ||
    isCacheMutationBarrier(cached) ||
    isCacheMutationBarrier(incoming)
  ) {
    return false;
  }
  const c = cached as Record<string, unknown>;
  const inc = incoming as Record<string, unknown>;

  if (typeof c.version === 'number' && typeof inc.version === 'number') {
    return c.version > inc.version;
  }

  if (typeof c.__gen === 'number' && typeof inc.__gen === 'number') {
    return c.__gen > inc.__gen;
  }

  if (c.updatedAt !== undefined && inc.updatedAt !== undefined) {
    const cTime =
      c.updatedAt instanceof Date
        ? c.updatedAt.getTime()
        : new Date(c.updatedAt as string | number).getTime();
    const incTime =
      inc.updatedAt instanceof Date
        ? inc.updatedAt.getTime()
        : new Date(inc.updatedAt as string | number).getTime();
    if (!Number.isNaN(cTime) && !Number.isNaN(incTime)) {
      return cTime > incTime;
    }
  }

  return false;
}
