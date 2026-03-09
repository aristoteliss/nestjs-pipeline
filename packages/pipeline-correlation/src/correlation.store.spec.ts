import { describe, it, expect } from 'vitest';
import { correlationStore, runWithCorrelationId, addCorrelationId, correlationHeaders } from './correlation.store';

describe('correlationStore', () => {
  it('returns undefined when no store is active', () => {
    expect(correlationStore.getStore()).toBeUndefined();
  });

  it('stores and retrieves a correlation ID', () => {
    correlationStore.run('test-id', () => {
      expect(correlationStore.getStore()).toBe('test-id');
    });
  });

  it('does not leak correlation ID outside run()', () => {
    correlationStore.run('scoped', () => {
      // inside
    });
    expect(correlationStore.getStore()).toBeUndefined();
  });

  it('supports nested contexts (inner overrides outer)', () => {
    correlationStore.run('outer', () => {
      expect(correlationStore.getStore()).toBe('outer');

      correlationStore.run('inner', () => {
        expect(correlationStore.getStore()).toBe('inner');
      });

      expect(correlationStore.getStore()).toBe('outer');
    });
  });
});

describe('runWithCorrelationId', () => {
  it('runs fn inside a correlation context when id is provided', () => {
    const result = runWithCorrelationId('my-id', () => {
      return correlationStore.getStore();
    });
    expect(result).toBe('my-id');
  });

  it('generates a uuidv7 fallback when id is undefined', () => {
    const result = runWithCorrelationId(undefined, () => {
      return correlationStore.getStore();
    });
    expect(result).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates a uuidv7 fallback when id is empty string', () => {
    const result = runWithCorrelationId('', () => {
      return correlationStore.getStore();
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

describe('addCorrelationId', () => {
  it('stamps correlationId from the active context', () => {
    const result = runWithCorrelationId('ctx-abc', () => {
      return addCorrelationId({ userId: '1', email: 'a@b.com' });
    });
    expect(result).toEqual({ userId: '1', email: 'a@b.com', correlationId: 'ctx-abc' });
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
    expect(() => addCorrelationId([{ id: 1 }, { id: 2 }] as any)).toThrow(TypeError);
    expect(() => addCorrelationId([{ id: 1 }, { id: 2 }] as any)).toThrow(
      /received an array/,
    );
  });

  it('throws TypeError for empty array', () => {
    expect(() => addCorrelationId([] as any)).toThrow(TypeError);
  });
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
