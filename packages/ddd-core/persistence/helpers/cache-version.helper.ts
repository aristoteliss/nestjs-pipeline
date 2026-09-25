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
    typeof incoming !== 'object'
  ) {
    return false;
  }

  // A barrier records a mutation that has already been durably applied, so it
  // outranks any snapshot: a write-through that started before a concurrent
  // delete must not overwrite it, or the deleted aggregate would reappear in the
  // cache as an ordinary hit.
  if (isCacheMutationBarrier(cached)) {
    if (!isCacheMutationBarrier(incoming)) return true;
    // Between two barriers the later one wins, so a fresh mutation can still
    // supersede an older one.
    return incoming.createdAt <= cached.createdAt;
  }

  // A barrier arriving over a snapshot must always be applied.
  if (isCacheMutationBarrier(incoming)) return false;

  const c = cached as Record<string, unknown>;
  const inc = incoming as Record<string, unknown>;

  if (typeof c.version === 'number' && typeof inc.version === 'number') {
    return c.version > inc.version;
  }

  if (typeof c.__gen === 'number' && typeof inc.__gen === 'number') {
    return c.__gen > inc.__gen;
  }

  if (c.updatedAt !== undefined && inc.updatedAt !== undefined) {
    const cTime = new Date(c.updatedAt as Date | string | number).getTime();
    const incTime = new Date(inc.updatedAt as Date | string | number).getTime();
    if (!Number.isNaN(cTime) && !Number.isNaN(incTime)) {
      return cTime > incTime;
    }
  }

  return false;
}
