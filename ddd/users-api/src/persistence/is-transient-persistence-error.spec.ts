import { TransientOperationError } from '@common/resilience/transient-operation.error';
import { describe, expect, it } from 'vitest';
import {
  isTransientPersistenceError,
  mapPersistenceError,
} from './is-transient-persistence-error';

describe('persistence transient error mapping', () => {
  it.each(['40001', '40P01', 'ECONNRESET', 'SQLITE_BUSY'])(
    'classifies transient persistence code %s inside the adapter',
    (code) => {
      expect(isTransientPersistenceError({ code })).toBe(true);
    },
  );

  it('recognizes a transient nested cause', () => {
    expect(isTransientPersistenceError({ cause: { code: 'ETIMEDOUT' } })).toBe(
      true,
    );
  });

  it('maps a transient driver failure to the neutral application signal', () => {
    const driverError = { code: '40001' };
    const mapped = mapPersistenceError(driverError, 'deleting an aggregate');

    expect(mapped).toBeInstanceOf(TransientOperationError);
    expect((mapped as Error & { cause?: unknown }).cause).toBe(driverError);
  });

  it('leaves deterministic/non-transient errors unchanged', () => {
    const deterministic = new Error('validation failed');
    expect(mapPersistenceError(deterministic, 'saving')).toBe(deterministic);
  });
});
