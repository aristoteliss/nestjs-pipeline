/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { stableStringify } from './stable-stringify';

describe('stableStringify', () => {
  it('produces identical strings regardless of key insertion order', () => {
    const objA = { name: 'Alice', age: 30, active: true };
    const objB = { active: true, age: 30, name: 'Alice' };

    expect(stableStringify(objA)).toBe(stableStringify(objB));
    expect(stableStringify(objA)).toBe(
      '{"active":true,"age":30,"name":"Alice"}',
    );
  });

  it('handles nested objects and arrays deterministically', () => {
    const nestedA = { meta: { z: 1, a: 2 }, tags: ['alpha', 'beta'] };
    const nestedB = { tags: ['alpha', 'beta'], meta: { a: 2, z: 1 } };

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

  it('normalizes class instances based on own enumerable properties', () => {
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

  it('validates the public toJSON snapshot instead of internal symbol state', () => {
    const internal = Symbol('aggregate-events');
    const aggregate = {
      [internal]: [] as unknown[],
      toJSON: () => ({ z: 2, a: { value: 1 } }),
    };
    aggregate[internal].push(aggregate);

    expect(stableStringify(aggregate)).toBe('{"a":{"value":1},"z":2}');
  });

  it.each([
    { value: Symbol('unsupported') },
    { [Symbol('unsupported')]: 'hidden' },
    { value: undefined },
    { value: new Map() },
  ])('rejects unsupported values exposed by toJSON: %s', (snapshot) => {
    expect(() => stableStringify({ toJSON: () => snapshot })).toThrow(
      TypeError,
    );
  });

  it('rejects toJSON snapshots referencing their source object', () => {
    const aggregate = {
      [Symbol('internal')]: true,
      toJSON: (): unknown => ({ aggregate }),
    };
    expect(() => stableStringify(aggregate)).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          message: expect.stringMatching(/Cyclic/),
        }),
      }),
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
});

describe('stableStringify failure diagnostics', () => {
  it.each([
    [
      'a cycle',
      () => {
        const a: Record<string, unknown> = {};
        a.self = a;
        return a;
      },
      'Cyclic',
    ],
    ['a Map', () => new Map([['a', 1]]), 'supported JSON domain'],
    [
      'a non-finite number',
      () => ({ n: Number.POSITIVE_INFINITY }),
      'Non-finite',
    ],
    [
      'a symbol-keyed property',
      () => ({ [Symbol('s')]: 1, a: 1 }),
      'Symbol-keyed',
    ],
    ['an invalid date', () => new Date(Number.NaN), 'Invalid dates'],
    ['a function', () => () => 1, 'Unsupported JSON value type: function'],
  ])(
    'preserves the precise reason for %s as the cause',
    (_label, build, expected) => {
      let thrown: unknown;
      try {
        stableStringify(build());
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toBeInstanceOf(TypeError);
      expect((thrown as Error).message).toBe(
        'stableStringify requires an acyclic JSON-serializable value.',
      );
      const cause = (thrown as { cause?: unknown }).cause;
      expect(cause).toBeInstanceOf(TypeError);
      expect((cause as Error).message).toContain(expected);
    },
  );

  it('rejects an unsupported value without a constructor name', () => {
    const value = new Map();
    Object.defineProperty(value, 'constructor', { value: undefined });
    expect(() => stableStringify(value)).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          message: 'Object is outside the supported JSON domain.',
        }),
      }),
    );
  });
});

/**
 * Exact outputs recorded from `@nestjs-pipeline/core`'s `stableStringify`. This
 * serializer forms cache keys, so any change here would silently move every key.
 */
describe('stableStringify frozen output', () => {
  it.each([
    [
      'nested objects sort at every level',
      { b: 1, a: { d: [3, 2, { f: 1, e: 2 }], c: null } },
      '{"a":{"c":null,"d":[3,2,{"e":2,"f":1}]},"b":1}',
    ],
    [
      'keys sort by UTF-16 code unit',
      { é: 1, a: 2, Z: 3 },
      '{"Z":3,"a":2,"é":1}',
    ],
    [
      'dates and toJSON results',
      {
        at: new Date('2026-01-02T03:04:05.000Z'),
        v: { toJSON: () => ({ y: 1, x: 2 }) },
      },
      '{"at":"2026-01-02T03:04:05.000Z","v":{"x":2,"y":1}}',
    ],
    [
      'string escapes and empty values',
      { q: 'say "hi"\n\t\\', empty: '', arr: [] },
      '{"arr":[],"empty":"","q":"say \\"hi\\"\\n\\t\\\\"}',
    ],
    [
      'primitives in arrays',
      [true, false, 0, -1.5, null, 'x'],
      '[true,false,0,-1.5,null,"x"]',
    ],
  ])('%s', (_label, value, expected) => {
    expect(stableStringify(value)).toBe(expected);
  });
});
