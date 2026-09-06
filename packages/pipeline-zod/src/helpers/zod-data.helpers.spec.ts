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
import { cloneData, deepEqual, hasBeenMutated } from './zod-data.helpers';

describe('zod-data.helpers', () => {
  describe('deepEqual', () => {
    it('returns true for identical primitive values', () => {
      expect(deepEqual(1, 1)).toBe(true);
      expect(deepEqual('test', 'test')).toBe(true);
      expect(deepEqual(true, true)).toBe(true);
      expect(deepEqual(null, null)).toBe(true);
      expect(deepEqual(undefined, undefined)).toBe(true);
    });

    it('returns false when comparing Date with empty plain object {}', () => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      expect(deepEqual(date, {})).toBe(false);
      expect(deepEqual({}, date)).toBe(false);
    });

    it('returns true for matching Date instances and false for different Dates', () => {
      const d1 = new Date('2026-01-01T00:00:00.000Z');
      const d2 = new Date('2026-01-01T00:00:00.000Z');
      const d3 = new Date('2026-01-02T00:00:00.000Z');

      expect(deepEqual(d1, d2)).toBe(true);
      expect(deepEqual(d1, d3)).toBe(false);
    });

    it('handles NaN dates correctly', () => {
      expect(deepEqual(new Date('invalid'), new Date('invalid'))).toBe(true);
    });

    it('compares RegExp instances correctly', () => {
      expect(deepEqual(/abc/g, /abc/g)).toBe(true);
      expect(deepEqual(/abc/g, /abc/i)).toBe(false);
      expect(deepEqual(/abc/g, {})).toBe(false);
    });

    it('compares arrays and nested objects accurately', () => {
      expect(deepEqual([1, { a: 'b' }], [1, { a: 'b' }])).toBe(true);
      expect(deepEqual([1, { a: 'b' }], [1, { a: 'c' }])).toBe(false);
      expect(deepEqual([], {})).toBe(false);
    });

    it('compares Map instances accurately', () => {
      const m1 = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const m2 = new Map([
        ['a', 1],
        ['b', 2],
      ]);
      const m3 = new Map([
        ['a', 1],
        ['b', 3],
      ]);
      const m4 = new Map([['a', 1]]);

      expect(deepEqual(m1, m2)).toBe(true);
      expect(deepEqual(m1, m3)).toBe(false);
      expect(deepEqual(m1, m4)).toBe(false);
      expect(deepEqual(m1, {})).toBe(false);
    });

    it('compares Set instances accurately', () => {
      const s1 = new Set(['x', 'y']);
      const s2 = new Set(['x', 'y']);
      const s3 = new Set(['x', 'z']);
      const s4 = new Set(['x']);

      expect(deepEqual(s1, s2)).toBe(true);
      expect(deepEqual(s1, s3)).toBe(false);
      expect(deepEqual(s1, s4)).toBe(false);
      expect(deepEqual(s1, {})).toBe(false);
    });
  });

  describe('hasBeenMutated', () => {
    it('detects mutation when a Date property is replaced with {}', () => {
      const snapshot = {
        id: '123',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      const mutatedRequest = {
        id: '123',
        createdAt: {},
      };

      expect(hasBeenMutated(mutatedRequest, snapshot)).toBe(true);
    });

    it('returns false when request matches the snapshot', () => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      const snapshot = {
        id: '123',
        createdAt: date,
      };
      const request = {
        id: '123',
        createdAt: new Date(date.getTime()),
      };

      expect(hasBeenMutated(request, snapshot)).toBe(false);
    });

    it('returns false when request and snapshot have identical Map properties', () => {
      const snapshot = {
        id: '123',
        dataMap: new Map([['key', 'value']]),
      };
      const request = {
        id: '123',
        dataMap: new Map([['key', 'value']]),
      };

      expect(hasBeenMutated(request, snapshot)).toBe(false);
    });
  });

  describe('cloneData', () => {
    it('deep clones dates and nested objects', () => {
      const original = {
        date: new Date('2026-01-01T00:00:00.000Z'),
        nested: { count: 42 },
      };
      const copy = cloneData(original);

      expect(copy).toEqual(original);
      expect(copy.date).not.toBe(original.date);
      expect(copy.nested).not.toBe(original.nested);
    });

    it('deep clones Map and Set instances without converting them to {}', () => {
      const original = {
        map: new Map([['a', { x: 1 }]]),
        set: new Set([{ y: 2 }]),
      };
      const copy = cloneData(original);

      expect(copy.map).toBeInstanceOf(Map);
      expect(copy.set).toBeInstanceOf(Set);
      expect(copy.map).not.toBe(original.map);
      expect(copy.set).not.toBe(original.set);
      expect(deepEqual(copy.map, original.map)).toBe(true);
      expect(deepEqual(copy.set, original.set)).toBe(true);
    });
  });
});
