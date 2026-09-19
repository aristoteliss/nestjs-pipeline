/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REDACT_KEYS,
  REDACTED,
  redactValue,
  safeSanitize,
  safeStringify,
} from '../helpers/safeStringify';

describe('safeStringify', () => {
  it('excludes specified keys from objects', () => {
    const obj = { a: 1, b: 2, secret: 'hidden', password: '1234' };
    const exclude = new Set(['secret', 'password']);
    const result = safeStringify(obj, exclude);
    expect(result).toBe('{"a":1,"b":2}');
  });

  it('excludes keys at all nesting levels', () => {
    const obj = {
      a: 1,
      nested: { secret: 'hidden', b: 2 },
      arr: [{ password: 'x', c: 3 }],
    };
    const exclude = new Set(['secret', 'password']);
    const result = safeStringify(obj, exclude);
    expect(result).toBe('{"a":1,"nested":{"b":2},"arr":[{"c":3}]}');
  });

  it('returns all keys if excludeKeys is empty', () => {
    const obj = { a: 1, b: 2 };
    const result = safeStringify(obj, new Set());
    expect(result).toBe('{"a":1,"b":2}');
  });
  it('stringifies a plain object', () => {
    expect(safeStringify({ a: 1, b: 'hello' })).toBe('{"a":1,"b":"hello"}');
  });

  it('stringifies primitives', () => {
    expect(safeStringify(42)).toBe('42');
    expect(safeStringify('text')).toBe('"text"');
    expect(safeStringify(null)).toBe('null');
    expect(safeStringify(true)).toBe('true');
    expect(safeStringify(undefined)).toBe('undefined');
  });

  it('serializes an own __proto__ property as data', () => {
    const input = { value: 1 } as Record<string, unknown>;
    Object.defineProperty(input, '__proto__', {
      enumerable: true,
      value: { safe: true },
    });

    expect(safeStringify(input)).toBe('{"value":1,"__proto__":{"safe":true}}');
  });

  it('handles circular references gracefully', () => {
    const obj: Record<string, unknown> = { name: 'root' };
    obj.self = obj;

    const result = safeStringify(obj);
    expect(result).toContain('"name":"root"');
    expect(result).toContain('"self":"[Circular]"');
  });

  it('handles deeply nested circular references', () => {
    const a: Record<string, unknown> = { id: 'a' };
    const b: Record<string, unknown> = { id: 'b', parent: a };
    a.child = b;
    b.grandchild = a;

    const result = safeStringify(a);
    expect(result).toContain('[Circular]');
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('does not misclassify a repeated non-circular object reference as circular', () => {
    const shared = { id: 'shared' };
    const result = safeStringify({ first: shared, second: shared });

    expect(result).toBe('{"first":{"id":"shared"},"second":{"id":"shared"}}');
  });

  it('handles self-referential Map and Set values without recursing forever', () => {
    const map = new Map<string, unknown>();
    map.set('self', map);
    const set = new Set<unknown>();
    set.add(set);

    expect(safeStringify(map)).toBe('{"self":"[Circular]"}');
    expect(safeStringify(set)).toBe('["[Circular]"]');
  });

  it('does not throw when sanitizing an invalid Date', () => {
    const invalid = new Date('not-a-date');
    expect(() => safeStringify({ invalid })).not.toThrow();
    expect(safeStringify({ invalid })).toBe('{"invalid":"[Invalid Date]"}');
  });

  it('supports indentation', () => {
    const result = safeStringify({ x: 1 }, new Set(), 2);
    expect(result).toContain('\n');
    expect(result).toContain('  "x": 1');
  });

  it('handles arrays', () => {
    expect(safeStringify([1, 2, 3])).toBe('[1,2,3]');
  });

  it('handles undefined values in objects (omitted by JSON.stringify)', () => {
    const result = safeStringify({ a: 1, b: undefined });
    expect(result).toBe('{"a":1}');
  });

  it('handles Date objects', () => {
    const date = new Date('2026-01-01T00:00:00.000Z');
    const result = safeStringify({ date });
    expect(result).toContain('2026-01-01');
  });

  describe('safeSanitize & clone mode', () => {
    it('clones Date and RegExp preserving types and properties', () => {
      const date = new Date('2026-05-10T12:00:00.000Z');
      const regex = /pattern/gi;
      regex.lastIndex = 3;

      const sanitized = safeSanitize({ date, regex }, { mode: 'clone' }) as {
        date: Date;
        regex: RegExp;
      };

      expect(sanitized.date).toBeInstanceOf(Date);
      expect(sanitized.date.getTime()).toBe(date.getTime());
      expect(sanitized.regex).toBeInstanceOf(RegExp);
      expect(sanitized.regex.source).toBe('pattern');
      expect(sanitized.regex.flags).toBe('gi');
      expect(sanitized.regex.lastIndex).toBe(3);

      const jsonRegexp = safeSanitize(/pattern/gi, { mode: 'json' });
      expect(jsonRegexp).toBe('/pattern/gi');
    });

    it('clones Error objects preserving name, message, stack and extra properties', () => {
      const err = new Error('test-error');
      err.name = 'CustomError';
      (err as unknown as Record<string, unknown>).extraProp = 'visible';
      (err as unknown as Record<string, unknown>).secret = 'sensitive';

      const sanitized = safeSanitize(err, {
        mode: 'clone',
        redactKeys: ['secret'],
      }) as Error & { extraProp: string; secret: string };

      expect(sanitized).toBeInstanceOf(Error);
      expect(sanitized.name).toBe('CustomError');
      expect(sanitized.message).toBe('test-error');
      expect(sanitized.stack).toBe(err.stack);
      expect(sanitized.extraProp).toBe('visible');
      expect(sanitized.secret).toBe(REDACTED);
    });

    it('serializes Error in json mode with name, message, and stack', () => {
      const err = new Error('json-error');
      const sanitized = safeSanitize(err, { mode: 'json' }) as {
        name: string;
        message: string;
        stack?: string;
      };
      expect(sanitized.name).toBe('Error');
      expect(sanitized.message).toBe('json-error');
      expect(sanitized.stack).toBeDefined();
    });

    it('handles binary data: Buffer, ArrayBuffer, and ArrayBufferView', () => {
      const buf = Buffer.from('hello buffer');
      const ab = new ArrayBuffer(8);
      const view = new Uint8Array([1, 2, 3]);

      const jsonSanitized = safeSanitize(
        { buf, ab, view },
        { mode: 'json' },
      ) as Record<string, string>;
      expect(jsonSanitized.buf).toBe('[Binary Data]');
      expect(jsonSanitized.ab).toBe('[Binary Data]');
      expect(jsonSanitized.view).toBe('[Binary Data]');

      const cloned = safeSanitize(
        { buf, ab, view },
        { mode: 'clone' },
      ) as Record<string, unknown>;
      expect(ArrayBuffer.isView(cloned.buf)).toBe(true);
      expect(cloned.ab).toBeInstanceOf(ArrayBuffer);
      expect(ArrayBuffer.isView(cloned.view)).toBe(true);
    });

    it('handles Node streams and Multer file objects', () => {
      const stream = {
        pipe: () => {},
        on: () => {},
      };
      const multerFile = {
        originalname: 'document.pdf',
        buffer: Buffer.from('dummy-content'),
      };

      const sanitized = safeSanitize(
        { stream, multerFile },
        { mode: 'json' },
      ) as Record<string, string>;
      expect(sanitized.stream).toBe('[Stream]');
      expect(sanitized.multerFile).toBe('[File: document.pdf]');
    });

    it('clones and sanitizes Map and Set collections', () => {
      const map = new Map<string, unknown>([
        ['user', 'alice'],
        ['secretKey', 'hidden-token'],
      ]);
      const set = new Set(['item1', 'item2']);

      const cloned = safeSanitize(
        { map, set },
        { mode: 'clone', redactKeys: ['secretKey'] },
      ) as {
        map: Map<string, unknown>;
        set: Set<string>;
      };

      expect(cloned.map).toBeInstanceOf(Map);
      expect(cloned.map.get('user')).toBe('alice');
      expect(cloned.map.get('secretKey')).toBe(REDACTED);
      expect(cloned.set).toBeInstanceOf(Set);
      expect(Array.from(cloned.set)).toEqual(['item1', 'item2']);
    });

    it('copies enumerable symbol properties in clone mode', () => {
      const sym = Symbol('enumerable-symbol');
      const obj: Record<string | symbol, unknown> = { id: 1 };
      Object.defineProperty(obj, sym, {
        value: 'sym-value',
        enumerable: true,
        writable: true,
        configurable: true,
      });

      const cloned = safeSanitize(obj, { mode: 'clone' }) as Record<
        string | symbol,
        unknown
      >;
      expect(cloned[sym]).toBe('sym-value');
    });

    it('handles functions and non-safe primitives', () => {
      const fn = () => 'test';
      expect(safeSanitize(fn, { mode: 'json' })).toBe('[Function]');
      expect(safeSanitize(fn, { mode: 'clone' })).toBe(fn);

      const sym = Symbol('primitive-symbol');
      expect(safeSanitize(sym, { mode: 'json' })).toBe('[symbol]');
      expect(safeSanitize(sym, { mode: 'clone' })).toBe(sym);
    });

    it('supports dot-path exclusion and dot-path redaction', () => {
      const payload = {
        user: {
          profile: {
            ssn: '123-45-6789',
            bio: 'developer',
          },
          meta: {
            internalId: 'secret-id',
          },
        },
      };

      const result = safeSanitize(payload, {
        excludeKeys: ['user.meta.internalId'],
        redactKeys: ['user.profile.ssn'],
        redactReplacement: '***MASKED***',
      }) as { user: { profile: { ssn: string; bio: string }; meta?: object } };

      expect(result.user.profile.ssn).toBe('***MASKED***');
      expect(result.user.profile.bio).toBe('developer');
      expect(result.user.meta).toEqual({});
    });
  });

  describe('redactValue', () => {
    it('redacts sensitive fields by default in deep objects and arrays', () => {
      const sensitive = {
        password: 'pass',
        token: 'token123',
        nested: {
          apiKey: 'key456',
          cvv: '123',
        },
        items: [{ secret: 'topsecret' }],
      };

      const redacted = redactValue(sensitive) as typeof sensitive;
      expect(redacted.password).toBe(REDACTED);
      expect(redacted.token).toBe(REDACTED);
      expect(redacted.nested.apiKey).toBe(REDACTED);
      expect(redacted.nested.cvv).toBe(REDACTED);
      expect(redacted.items[0].secret).toBe(REDACTED);
    });

    it('accepts custom redact keys list', () => {
      const data = { customSecret: 'abc', normal: 'def' };
      const redacted = redactValue(data, ['customSecret']) as typeof data;
      expect(redacted.customSecret).toBe(REDACTED);
      expect(redacted.normal).toBe('def');
    });

    it('exposes DEFAULT_REDACT_KEYS constant', () => {
      expect(DEFAULT_REDACT_KEYS).toContain('password');
      expect(DEFAULT_REDACT_KEYS).toContain('token');
      expect(DEFAULT_REDACT_KEYS).toContain('secret');
    });
  });
});
