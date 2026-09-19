/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { isCacheNewer } from './cache-version.helper';

describe('isCacheNewer', () => {
  describe('numeric version comparison', () => {
    it('returns true when cached version is strictly greater than incoming version', () => {
      expect(isCacheNewer({ version: 2 }, { version: 1 })).toBe(true);
      expect(isCacheNewer({ version: 10 }, { version: 9 })).toBe(true);
    });

    it('returns false when cached version is equal or less than incoming version', () => {
      expect(isCacheNewer({ version: 1 }, { version: 2 })).toBe(false);
      expect(isCacheNewer({ version: 1 }, { version: 1 })).toBe(false);
    });
  });

  describe('generation counter (__gen) comparison', () => {
    it('returns true when cached __gen is strictly greater than incoming __gen', () => {
      expect(isCacheNewer({ __gen: 5 }, { __gen: 4 })).toBe(true);
    });

    it('returns false when cached __gen is equal or less than incoming __gen', () => {
      expect(isCacheNewer({ __gen: 4 }, { __gen: 5 })).toBe(false);
      expect(isCacheNewer({ __gen: 5 }, { __gen: 5 })).toBe(false);
    });
  });

  describe('updatedAt timestamp comparison', () => {
    it('returns true when cached updatedAt Date is newer than incoming Date', () => {
      const older = new Date('2026-01-01T00:00:00.000Z');
      const newer = new Date('2026-01-02T00:00:00.000Z');
      expect(isCacheNewer({ updatedAt: newer }, { updatedAt: older })).toBe(
        true,
      );
      expect(isCacheNewer({ updatedAt: older }, { updatedAt: newer })).toBe(
        false,
      );
      expect(isCacheNewer({ updatedAt: newer }, { updatedAt: newer })).toBe(
        false,
      );
    });

    it('returns true when cached updatedAt ISO string is newer than incoming ISO string', () => {
      expect(
        isCacheNewer(
          { updatedAt: '2026-01-02T00:00:00.000Z' },
          { updatedAt: '2026-01-01T00:00:00.000Z' },
        ),
      ).toBe(true);
      expect(
        isCacheNewer(
          { updatedAt: '2026-01-01T00:00:00.000Z' },
          { updatedAt: '2026-01-02T00:00:00.000Z' },
        ),
      ).toBe(false);
    });

    it('handles mixed Date and string formats cleanly', () => {
      const newerDate = new Date('2026-01-02T12:00:00.000Z');
      const olderString = '2026-01-01T12:00:00.000Z';
      expect(
        isCacheNewer({ updatedAt: newerDate }, { updatedAt: olderString }),
      ).toBe(true);
      expect(
        isCacheNewer({ updatedAt: olderString }, { updatedAt: newerDate }),
      ).toBe(false);
    });

    it('returns false for invalid date strings', () => {
      expect(
        isCacheNewer({ updatedAt: 'invalid' }, { updatedAt: '2026-01-01' }),
      ).toBe(false);
      expect(
        isCacheNewer({ updatedAt: '2026-01-01' }, { updatedAt: 'invalid' }),
      ).toBe(false);
    });
  });

  describe('primitives, nullish values, and objects without ordering fields', () => {
    it('returns false when cached or incoming is null, undefined, or primitive', () => {
      expect(isCacheNewer(null, { version: 1 })).toBe(false);
      expect(isCacheNewer({ version: 1 }, null)).toBe(false);
      expect(isCacheNewer(undefined, { version: 1 })).toBe(false);
      expect(isCacheNewer({ version: 1 }, undefined)).toBe(false);
      expect(isCacheNewer('str', { version: 1 })).toBe(false);
      expect(isCacheNewer(123, 456)).toBe(false);
      expect(isCacheNewer(true, false)).toBe(false);
    });

    it('returns false when objects have no version, __gen, or updatedAt fields', () => {
      expect(isCacheNewer({ id: '1' }, { id: '1' })).toBe(false);
      expect(isCacheNewer({ other: 5 }, { other: 2 })).toBe(false);
    });
  });
});

/**
 * Barrier precedence is the writer-side half of the anti-resurrection design.
 * The reader-side checks in `@FromCache` never engage against a plain snapshot,
 * so if a write-through may overwrite a barrier the whole mechanism has a hole:
 * a delete installs a barrier, a slower concurrent update writes its snapshot
 * over it, and every later read sees an ordinary hit for a row that is gone.
 */
describe('isCacheNewer barrier precedence', () => {
  const barrier = (createdAt: number) => ({
    __cacheBarrier: true as const,
    token: `t-${createdAt}`,
    reason: 'deleted' as const,
    createdAt,
  });

  it('keeps a barrier in place against any snapshot, however high its version', () => {
    expect(isCacheNewer(barrier(1_000), { version: 999_999 })).toBe(true);
    expect(isCacheNewer(barrier(1_000), { __gen: 999_999 })).toBe(true);
    expect(
      isCacheNewer(barrier(1_000), { updatedAt: new Date('2099-01-01') }),
    ).toBe(true);
  });

  it('lets a barrier overwrite a cached snapshot', () => {
    expect(isCacheNewer({ version: 5 }, barrier(1_000))).toBe(false);
  });

  it('lets a later barrier supersede an earlier one', () => {
    expect(isCacheNewer(barrier(1_000), barrier(2_000))).toBe(false);
  });

  it('keeps the existing barrier when a stale one arrives late', () => {
    expect(isCacheNewer(barrier(2_000), barrier(1_000))).toBe(true);
  });

  it('keeps the existing barrier for an identical timestamp', () => {
    expect(isCacheNewer(barrier(1_000), barrier(1_000))).toBe(true);
  });
});
