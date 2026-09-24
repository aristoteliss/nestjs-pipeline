/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from '../domain/exceptions/concurrency-conflict.error';
import { DomainException } from '../domain/exceptions/domain.exception';
import { EntityNotFoundException } from '../domain/exceptions/entity-not-found.exception';
import { TransientOperationError } from '../domain/exceptions/transient-operation.error';
import {
  isTransientPersistenceError,
  mapPersistenceError,
} from './is-transient-persistence-error';

class UniqueEmailException extends DomainException {}

describe('persistence transient error mapping', () => {
  it.each([
    new EntityNotFoundException('User', 'user-1'),
    new ConcurrencyConflictError('User', 'user-1', 3, 4),
    new UniqueEmailException('email already registered'),
    new Error('validation failed'),
  ])('does not retry deterministic domain failures', (error) => {
    expect(isTransientPersistenceError(error)).toBe(false);
  });

  it.each([null, undefined, 'ECONNRESET', 40001])(
    'does not classify the non-object %s',
    (error) => {
      expect(isTransientPersistenceError(error)).toBe(false);
    },
  );

  it.each([
    '40001',
    '40P01',
    '55P03',
    '57P01',
    '57P02',
    '57P03',
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EPIPE',
    'ETIMEDOUT',
    'SQLITE_BUSY',
    'SQLITE_LOCKED',
  ])('classifies transient persistence code %s inside the adapter', (code) => {
    expect(isTransientPersistenceError({ code })).toBe(true);
  });

  it.each(['08000', '08006', '53000', '53300'])(
    'classifies the PostgreSQL connection and resource class code %s',
    (code) => {
      expect(isTransientPersistenceError({ code })).toBe(true);
    },
  );

  it.each(['TaskCancelledError', 'TimeoutError'])(
    'classifies an error named %s',
    (name) => {
      expect(isTransientPersistenceError({ name })).toBe(true);
    },
  );

  it('ignores a code that is not a string', () => {
    expect(isTransientPersistenceError({ code: 40001 })).toBe(false);
  });

  it('recognizes a transient nested cause', () => {
    expect(isTransientPersistenceError({ cause: { code: 'ETIMEDOUT' } })).toBe(
      true,
    );
  });

  it('follows the whole cause chain, and stops where it ends', () => {
    expect(
      isTransientPersistenceError({
        cause: { cause: { cause: { code: '40P01' } } },
      }),
    ).toBe(true);
    expect(
      isTransientPersistenceError({ cause: { cause: { code: '23505' } } }),
    ).toBe(false);
  });

  it('terminates on a cyclic cause chain instead of overflowing the stack', () => {
    const wrapper: { message: string; cause?: unknown } = {
      message: 'pool error',
    };
    wrapper.cause = { message: 'driver error', cause: wrapper };

    expect(isTransientPersistenceError(wrapper)).toBe(false);
    expect(mapPersistenceError(wrapper, 'loading User')).toBe(wrapper);

    wrapper.cause = { code: 'ECONNRESET', cause: wrapper };
    expect(isTransientPersistenceError(wrapper)).toBe(true);
  });

  it('maps a transient driver failure to the neutral application signal', () => {
    const driverError = { code: '40001' };
    const mapped = mapPersistenceError(driverError, 'deleting an aggregate');

    expect(mapped).toBeInstanceOf(TransientOperationError);
    expect((mapped as Error).message).toBe(
      'Transient persistence failure while deleting an aggregate.',
    );
    expect((mapped as Error & { cause?: unknown }).cause).toBe(driverError);
  });

  it('leaves deterministic/non-transient errors unchanged', () => {
    const deterministic = new Error('validation failed');
    expect(mapPersistenceError(deterministic, 'saving')).toBe(deterministic);
  });
});
