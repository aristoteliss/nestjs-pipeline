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
import { toCacheSnapshot } from './cache-snapshot.helper';

describe('toCacheSnapshot', () => {
  it('uses serializeFn when provided', () => {
    const input = { id: 'u1', secret: '123' };
    const result = toCacheSnapshot(input, (val) => ({ id: val.id }));
    expect(result).toEqual({ id: 'u1' });
  });

  it('calls toJSON() when present on the object', () => {
    class Aggregate {
      constructor(
        public readonly id: string,
        public readonly version: number,
      ) {}

      toJSON() {
        return {
          id: this.id,
          version: this.version,
          isSnapshot: true,
        };
      }
    }

    const agg = new Aggregate('u1', 2);
    const result = toCacheSnapshot(agg);
    expect(result).toEqual({
      id: 'u1',
      version: 2,
      isSnapshot: true,
    });
  });

  it('deep clones plain objects and objects without toJSON() to detach references', () => {
    const original = { id: 'u1', nested: { role: 'admin' } };
    const snapshot = toCacheSnapshot(original) as typeof original;

    expect(snapshot).toEqual(original);
    expect(snapshot).not.toBe(original);
    expect(snapshot.nested).not.toBe(original.nested);

    // Mutating original does not mutate snapshot
    original.nested.role = 'user';
    expect(snapshot.nested.role).toBe('admin');
  });

  it('converts Date instances to ISO strings when deep cloning objects without toJSON', () => {
    const date = new Date('2026-09-13T12:00:00.000Z');
    const input = { id: 'u1', createdAt: date };
    const snapshot = toCacheSnapshot(input) as {
      id: string;
      createdAt: string;
    };

    expect(snapshot.createdAt).toBe('2026-09-13T12:00:00.000Z');
  });

  it('returns primitives and nullish values as-is', () => {
    expect(toCacheSnapshot(null)).toBeNull();
    expect(toCacheSnapshot(undefined)).toBeUndefined();
    expect(toCacheSnapshot('hello')).toBe('hello');
    expect(toCacheSnapshot(42)).toBe(42);
    expect(toCacheSnapshot(true)).toBe(true);
  });
});
