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
import { fingerprintValue, stableStringify } from './fingerprint';

describe('stableStringify and fingerprintValue', () => {
  it('produces identical string and hash regardless of key insertion order', () => {
    const objA = { name: 'Alice', age: 30, active: true };
    const objB = { active: true, age: 30, name: 'Alice' };

    expect(stableStringify(objA)).toBe(stableStringify(objB));
    expect(fingerprintValue(objA)).toBe(fingerprintValue(objB));
  });

  it('handles nested objects and arrays deterministically', () => {
    const nestedA = {
      meta: { z: 1, a: 2 },
      tags: ['alpha', 'beta'],
    };
    const nestedB = {
      tags: ['alpha', 'beta'],
      meta: { a: 2, z: 1 },
    };

    expect(stableStringify(nestedA)).toBe(stableStringify(nestedB));
    expect(fingerprintValue(nestedA)).toBe(fingerprintValue(nestedB));
  });

  it('handles primitive values, null, and empty objects', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(123)).toBe('123');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify({})).toBe('{}');
    expect(stableStringify([])).toBe('[]');
  });

  it('produces different fingerprints for different data', () => {
    const hash1 = fingerprintValue({ email: 'user1@example.com' });
    const hash2 = fingerprintValue({ email: 'user2@example.com' });
    expect(hash1).not.toBe(hash2);
  });
});
