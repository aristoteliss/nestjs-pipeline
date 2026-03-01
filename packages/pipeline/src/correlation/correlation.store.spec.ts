import { describe, it, expect } from 'vitest';
import { correlationStore, runWithCorrelationId } from '../correlation/correlation.store';

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

  it('runs fn without a store when id is undefined', () => {
    const result = runWithCorrelationId(undefined, () => {
      return correlationStore.getStore();
    });
    expect(result).toBeUndefined();
  });

  it('runs fn without a store when id is empty string', () => {
    const result = runWithCorrelationId('', () => {
      return correlationStore.getStore();
    });
    expect(result).toBeUndefined();
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
