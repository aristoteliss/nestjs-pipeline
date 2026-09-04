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
import { stableStringify, toStrictJsonValue } from './stableStringify';

describe('stableStringify and toStrictJsonValue', () => {
  it('produces identical strings regardless of key insertion order', () => {
    const objA = { name: 'Alice', age: 30, active: true };
    const objB = { active: true, age: 30, name: 'Alice' };

    expect(stableStringify(objA)).toBe(stableStringify(objB));
    expect(stableStringify(objA)).toBe(
      '{"active":true,"age":30,"name":"Alice"}',
    );
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
    expect(stableStringify(nestedA)).toBe(
      '{"meta":{"a":2,"z":1},"tags":["alpha","beta"]}',
    );
  });

  it('preserves array element order', () => {
    expect(stableStringify([3, 1, 2])).toBe('[3,1,2]');
  });

  it('serializes primitives, null, and empty collections', () => {
    expect(stableStringify(null)).toBe('null');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify(123)).toBe('123');
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify(false)).toBe('false');
    expect(stableStringify({})).toBe('{}');
    expect(stableStringify([])).toBe('[]');
  });

  it('normalizes CQRS class instances based on own enumerable properties', () => {
    class CreateCommand {
      constructor(readonly payload: Record<string, unknown>) {}
    }

    const first = new CreateCommand({
      profile: { lastName: 'Lovelace', firstName: 'Ada' },
      enabled: true,
    });
    const second = new CreateCommand({
      enabled: true,
      profile: { firstName: 'Ada', lastName: 'Lovelace' },
    });

    expect(stableStringify(first)).toBe(stableStringify(second));
  });

  it('honors toJSON() on objects', () => {
    const withToJson = {
      name: 'Item',
      toJSON() {
        return { custom: 'serialized' };
      },
    };

    expect(stableStringify(withToJson)).toBe('{"custom":"serialized"}');
  });

  it('converts valid dates to ISO string representation', () => {
    expect(stableStringify({ at: new Date('2026-01-01T00:00:00.000Z') })).toBe(
      '{"at":"2026-01-01T00:00:00.000Z"}',
    );
  });

  it('rejects values outside the supported JSON domain', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(() => stableStringify(undefined)).toThrow(/JSON-serializable/);
    expect(() => stableStringify(1n)).toThrow(/JSON-serializable/);
    expect(() => stableStringify(cyclic)).toThrow(/JSON-serializable/);
    expect(() => stableStringify({ value: new Map([['a', 1]]) })).toThrow(
      /JSON-serializable/,
    );
    expect(() => stableStringify({ value: new Set([1]) })).toThrow(
      /JSON-serializable/,
    );
    expect(() => stableStringify({ value: /pattern/ })).toThrow(
      /JSON-serializable/,
    );
    expect(() => stableStringify({ value: new Error('failure') })).toThrow(
      /JSON-serializable/,
    );
    expect(() => stableStringify({ value: Number.NaN })).toThrow(
      /JSON-serializable/,
    );
    expect(() => stableStringify({ value: Number.POSITIVE_INFINITY })).toThrow(
      /JSON-serializable/,
    );
    expect(() => stableStringify({ bytes: new Uint8Array([1, 2]) })).toThrow(
      /JSON-serializable/,
    );
  });

  it('rejects sparse arrays, symbol properties, and undefined values in objects', () => {
    expect(() => stableStringify({ a: 1, optional: undefined })).toThrow(
      /JSON-serializable/,
    );
    expect(() => stableStringify([1, undefined, 3])).toThrow(
      /JSON-serializable/,
    );
    expect(() => stableStringify(new Array(1))).toThrow(/JSON-serializable/);
    expect(() =>
      stableStringify({ id: 1, [Symbol('scope')]: 'private' }),
    ).toThrow(/JSON-serializable/);
  });

  it('toStrictJsonValue respects sortKeys parameter', () => {
    const data = { z: 1, a: 2 };
    const unsorted = toStrictJsonValue(data, false) as Record<string, unknown>;
    const sorted = toStrictJsonValue(data, true) as Record<string, unknown>;

    expect(Object.keys(unsorted)).toEqual(['z', 'a']);
    expect(Object.keys(sorted)).toEqual(['a', 'z']);
  });
});
