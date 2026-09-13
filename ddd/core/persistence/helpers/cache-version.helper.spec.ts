/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
