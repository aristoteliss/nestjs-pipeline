/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  cloneData,
  deepEqual,
  getRawInput,
  getValidatedData,
  hasBeenMutated,
  ZOD_RAW_INPUT_KEY,
  ZOD_VALIDATED_DATA_KEY,
} from './zod-data.helpers';

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

    it('returns false when objects have different keys despite same length', () => {
      expect(deepEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
    });

    it('returns false when comparing array with object having same keys', () => {
      const arr = ['a'];
      const obj = { 0: 'a' };
      expect(deepEqual(arr, obj)).toBe(false);
      expect(deepEqual(obj, arr)).toBe(false);
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

    it('returns true when request is missing a property present in snapshot', () => {
      const snapshot = { a: 1, b: 2 };
      const request = { a: 1, c: 2 }; // same key length, different keys
      expect(hasBeenMutated(request, snapshot)).toBe(true);
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

describe('rich validation snapshot data', () => {
  it('matches Set elements one-to-one in both directions and ignores insertion order', () => {
    const repeated = new Set([{ n: 1 }, { n: 1 }]);
    const distinct = new Set([{ n: 1 }, { n: 2 }]);
    expect(deepEqual(repeated, distinct)).toBe(false);
    expect(deepEqual(distinct, repeated)).toBe(false);
    expect(deepEqual(distinct, new Set([{ n: 2 }, { n: 1 }]))).toBe(true);
  });

  it('matches nested unordered collections without reusing a candidate', () => {
    const left = new Set([
      new Map([[{ id: 1 }, new Set([2, 3])]]),
      new Map([[{ id: 2 }, new Set([4])]]),
    ]);
    const right = new Set([
      new Map([[{ id: 2 }, new Set([4])]]),
      new Map([[{ id: 1 }, new Set([3, 2])]]),
    ]);
    expect(deepEqual(left, right)).toBe(true);
    expect(deepEqual(left, cloneData(left))).toBe(true);
  });

  it('clones own __proto__ properties without invoking the prototype setter', () => {
    const data = JSON.parse(
      '{"__proto__":{"admin":true},"nested":{"__proto__":42}}',
    );
    const copy = cloneData(data);
    expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
    expect(Object.hasOwn(copy, '__proto__')).toBe(true);
    expect(Object.hasOwn(copy.nested, '__proto__')).toBe(true);
    expect(deepEqual(data, copy)).toBe(true);
  });

  it('retains sparse lengths and distinguishes holes from explicit undefined', () => {
    const empty = new Array(2);
    const copy = cloneData(empty);
    expect(copy).toHaveLength(2);
    expect(Object.hasOwn(copy, '0')).toBe(false);
    expect(deepEqual(empty, [])).toBe(false);
    expect(deepEqual(empty, [undefined, undefined])).toBe(false);
  });

  it('clones cyclic Maps and Sets with detached shared values', () => {
    const shared = { value: 1 };
    const map = new Map<unknown, unknown>();
    const set = new Set<unknown>();
    map.set(map, set);
    set.add(map);
    set.add(shared);
    const source = { map, set, shared };
    const copy = cloneData(source);
    expect(copy.map.get(copy.map)).toBe(copy.set);
    expect(copy.set.has(copy.map)).toBe(true);
    expect(copy.set.has(copy.shared)).toBe(true);
    expect(copy.shared).not.toBe(shared);
    expect(deepEqual(source, copy)).toBe(true);
    copy.shared.value = 2;
    expect(deepEqual(source, copy)).toBe(false);
    expect(deepEqual(copy, source)).toBe(false);
  });

  it('detects nested enumerable symbol changes', () => {
    const key = Symbol('value');
    const value = { [key]: 1 };
    const copy = cloneData(value);
    expect(deepEqual(value, copy)).toBe(true);
    value[key] = 2;
    expect(deepEqual(value, copy)).toBe(false);
  });

  it.each([
    new Uint8Array([1, 2]),
    new DataView(new Uint8Array([1, 2]).buffer),
    new Uint8Array([1, 2]).buffer,
    Buffer.from([1, 2]),
  ])('detaches binary snapshots and detects byte changes (%s)', (value) => {
    const copy = cloneData(value);
    expect(copy).not.toBe(value);
    expect(deepEqual(value, copy)).toBe(true);
    const view =
      value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    view[0] = 9;
    expect(deepEqual(value, copy)).toBe(false);
  });

  it('clones and compares large binary payloads without per-byte property work', () => {
    const payload = new Uint8Array(200_000).fill(7);
    const started = performance.now();
    const copy = cloneData(payload);
    expect(deepEqual(payload, copy)).toBe(true);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('detects RegExp position and Date attached-data mutations', () => {
    const expression = /x/g;
    expression.lastIndex = 2;
    const copy = cloneData(expression);
    expect(deepEqual(expression, copy)).toBe(true);
    expression.lastIndex = 3;
    expect(deepEqual(expression, copy)).toBe(false);
    const date = Object.assign(new Date(0), { allowed: true });
    const dateCopy = cloneData(date);
    date.allowed = false;
    expect(deepEqual(date, dateCopy)).toBe(false);
  });

  it('handles getRawInput with primitive values, unrecorded objects, and ZOD_RAW_INPUT_KEY', () => {
    expect(getRawInput(null)).toBeNull();
    expect(getRawInput(undefined)).toBeUndefined();
    expect(getRawInput('primitive')).toBe('primitive');
    expect(getRawInput(42)).toBe(42);

    const unrecorded = { unrecorded: true };
    expect(getRawInput(unrecorded)).toBe(unrecorded);

    const keyed = { [ZOD_RAW_INPUT_KEY]: { stored: true } };
    expect(getRawInput(keyed)).toEqual({ stored: true });
  });

  it('handles getValidatedData with non-object inputs, unrecorded objects, and ZOD_VALIDATED_DATA_KEY', () => {
    expect(getValidatedData(null)).toBeUndefined();
    expect(getValidatedData(undefined)).toBeUndefined();
    expect(getValidatedData('string')).toBeUndefined();
    expect(getValidatedData(123)).toBeUndefined();
    expect(getValidatedData({})).toBeUndefined();

    const keyed = { [ZOD_VALIDATED_DATA_KEY]: { parsed: 123 } };
    expect(getValidatedData(keyed)).toEqual({ parsed: 123 });
  });

  it('handles non-enumerable symbols and null prototype in deepEqual and cloneData', () => {
    const sym = Symbol('non-enumerable');
    const obj1 = {};
    Object.defineProperty(obj1, sym, { value: 1, enumerable: false });
    const obj2 = {};
    Object.defineProperty(obj2, sym, { value: 1, enumerable: false });
    expect(deepEqual(obj1, obj2)).toBe(true);

    const nullProto = Object.create(null);
    nullProto.key = 'value';
    const cloned = cloneData(nullProto);
    expect(Object.getPrototypeOf(cloned)).toBeNull();
    expect(deepEqual(nullProto, cloned)).toBe(true);
  });

  it('returns false when cyclic graph asymmetry occurs during deep comparison', () => {
    const cyclicB: Record<string, unknown> = {};
    cyclicB.ref = cyclicB;
    const acyclicA = { ref: { ref: 'other' } };
    expect(deepEqual(acyclicA, cyclicB)).toBe(false);
  });
});
