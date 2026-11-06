/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  addCorrelationId,
  correlationHeaders,
  correlationSource,
  getCorrelationId,
  runWithCorrelationId,
} from './correlation.store.js';

const source = correlationSource;

describe('getCorrelationId', () => {
  it('generates a new UUIDv7 on each call outside any scope', () => {
    const first = getCorrelationId();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(getCorrelationId()).not.toBe(first);
    expect(source.current()).toBeUndefined();
  });

  it('accepts only an id within the default length and character set', () => {
    expect(source.accepts('edge:req/1+a=b@c~d')).toBe(true);
    expect(source.accepts('a'.repeat(128))).toBe(true);
    expect(source.accepts('a'.repeat(129))).toBe(false);
    expect(source.accepts('a b')).toBe(false);
  });

  it('reads and sets the same id through correlationSource', () => {
    source.run('pipeline-id', () => {
      expect(getCorrelationId()).toBe('pipeline-id');
      expect(source.current()).toBe('pipeline-id');
    });
  });

  it('supports nested contexts (inner overrides outer)', () => {
    runWithCorrelationId('outer', () => {
      runWithCorrelationId('inner', () => {
        expect(getCorrelationId()).toBe('inner');
      });
      expect(getCorrelationId()).toBe('outer');
    });
  });
});

describe('runWithCorrelationId', () => {
  it('runs fn inside a correlation context when id is provided', () => {
    const result = runWithCorrelationId('my-id', () => {
      return source.current();
    });
    expect(result).toBe('my-id');
  });

  it('generates a uuidv7 fallback when id is undefined', () => {
    const result = runWithCorrelationId(undefined, () => {
      return source.current();
    });
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates a uuidv7 fallback when id is empty string', () => {
    const result = runWithCorrelationId('', () => {
      return source.current();
    });
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the value from fn', () => {
    const result = runWithCorrelationId('id', () => 42);
    expect(result).toBe(42);
  });

  it('propagates errors from fn', () => {
    expect(() =>
      runWithCorrelationId('id', () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });
});

describe('the check every write to the store applies', () => {
  const malformed = [
    ['a CR/LF pair', 'id\r\nx-admin: 1'],
    ['a tab', 'id\tx'],
    ['a NUL character', 'id\u0000x'],
    ['DEL', 'id\u007fx'],
    ['a Latin-1 character', 'café'],
    ['a character above 0xFF', 'id-\u2028'],
    ['a leading space', ' id'],
    ['a trailing space', 'id '],
    ['only spaces', '   '],
  ] as const;

  it.each(malformed)('runWithCorrelationId replaces an id with %s', (_, id) => {
    const result = runWithCorrelationId(id, () => source.current());
    expect(result).not.toBe(id);
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each(malformed)('correlationSource.run stores no id for %s', (_, id) => {
    expect(source.run(id, () => source.current())).toBeUndefined();
  });

  it('keeps the current id when the new one is malformed', () => {
    runWithCorrelationId('outer', () => {
      runWithCorrelationId('in\nner', () => {
        expect(getCorrelationId()).toBe('outer');
      });
    });
  });

  it.each([42, { id: 'x' }, ['id']])(
    'replaces a non-string value %j',
    (value) => {
      const result = runWithCorrelationId(value as never, () =>
        source.current(),
      );
      expect(result).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  const everyVisibleCharacter = String.fromCharCode(
    ...Array.from({ length: 0x7e - 0x21 + 1 }, (_, i) => 0x21 + i),
  );

  it.each(['!', '~', 'a b', '<b>"x"</b>', everyVisibleCharacter])(
    'leaves application rules to the application: keeps %j',
    (id) => {
      expect(runWithCorrelationId(id, () => source.current())).toBe(id);
      expect(source.run(id, () => source.current())).toBe(id);
    },
  );
});

describe('addCorrelationId', () => {
  it('stamps correlationId from the active context', () => {
    const result = runWithCorrelationId('ctx-abc', () => {
      return addCorrelationId({ userId: '1', email: 'a@b.com' });
    });
    expect(result).toEqual({
      userId: '1',
      email: 'a@b.com',
      correlationId: 'ctx-abc',
    });
  });

  it('generates a uuidv7 fallback when no context is active', () => {
    const result = addCorrelationId({ foo: 'bar' });
    expect(result.foo).toBe('bar');
    expect(result.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not mutate the original object', () => {
    const original = { key: 'value' };
    const stamped = addCorrelationId(original);
    expect(original).not.toHaveProperty('correlationId');
    expect(stamped).toHaveProperty('correlationId');
    expect(stamped.key).toBe('value');
  });

  it('works with an empty object', () => {
    const result = runWithCorrelationId('empty-test', () => {
      return addCorrelationId({});
    });
    expect(result).toEqual({ correlationId: 'empty-test' });
  });

  it('preserves all existing properties', () => {
    const data = { a: 1, b: 'two', c: [3], d: { nested: true } };
    const result = runWithCorrelationId('preserve-test', () => {
      return addCorrelationId(data);
    });
    expect(result).toEqual({ ...data, correlationId: 'preserve-test' });
  });

  it('throws TypeError when data is an array', () => {
    expect(() => addCorrelationId([{ id: 1 }, { id: 2 }] as any)).toThrow(
      TypeError,
    );
    expect(() => addCorrelationId([{ id: 1 }, { id: 2 }] as any)).toThrow(
      /plain object/,
    );
  });

  it('throws TypeError for empty array', () => {
    expect(() => addCorrelationId([] as any)).toThrow(TypeError);
  });

  it.each([new Date(), new Map(), new Set(), new (class Payload {})()])(
    'rejects non-plain object payloads',
    (value) => {
      expect(() => addCorrelationId(value as never)).toThrow(/plain object/);
    },
  );

  it.each([null, undefined, 1, 'payload', true])(
    'rejects non-object payload %j',
    (value) => {
      expect(() => addCorrelationId(value as never)).toThrow(/plain object/);
    },
  );
});

describe('correlationHeaders', () => {
  it('returns default x-correlation-id header from active context', () => {
    const result = runWithCorrelationId('hdr-abc', () => {
      return correlationHeaders();
    });
    expect(result).toEqual({ 'x-correlation-id': 'hdr-abc' });
  });

  it('supports a custom header key', () => {
    const result = runWithCorrelationId('custom-hdr', () => {
      return correlationHeaders('x-request-id');
    });
    expect(result).toEqual({ 'x-request-id': 'custom-hdr' });
  });

  it('generates a uuidv7 fallback when no context is active', () => {
    const result = correlationHeaders();
    expect(Object.keys(result)).toEqual(['x-correlation-id']);
    expect(result['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
