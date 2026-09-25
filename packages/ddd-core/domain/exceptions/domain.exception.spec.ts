/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { describe, expect, it } from 'vitest';
import { ConcurrencyConflictError } from './concurrency-conflict.error';
import { DomainException } from './domain.exception';
import {
  isTransientOperationError,
  TransientOperationError,
} from './transient-operation.error';
import { UnknownMutableFieldError } from './unknown-mutable-field.error';

class SampleDomainException extends DomainException {
  constructor(message = 'Sample error') {
    super(message);
  }
}

describe('DomainException', () => {
  it('instantiates and preserves error prototype and name', () => {
    const error = new SampleDomainException('Domain invariant violation');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainException);
    expect(error).toBeInstanceOf(SampleDomainException);
    expect(error.name).toBe('SampleDomainException');
    expect(error.message).toBe('Domain invariant violation');
  });

  describe('TransientOperationError', () => {
    it('creates error with cause and identifies via isTransientOperationError', () => {
      const cause = new Error('deadlock');
      const error = new TransientOperationError('Database transient fault', {
        cause,
      });

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TransientOperationError);
      expect(error.name).toBe('TransientOperationError');
      expect(error.message).toBe('Database transient fault');
      expect(error.cause).toBe(cause);

      expect(isTransientOperationError(error)).toBe(true);
      expect(isTransientOperationError(new Error('normal error'))).toBe(false);
      expect(isTransientOperationError(null)).toBe(false);
      expect(isTransientOperationError(undefined)).toBe(false);
    });
  });

  describe('ConcurrencyConflictError', () => {
    it('formats message without actualVersion and with actualVersion', () => {
      const errWithoutActual = new ConcurrencyConflictError('User', 'u-1', 1);
      expect(errWithoutActual.message).toBe(
        'User u-1 was modified concurrently: expected version 1.',
      );

      const errWithActual = new ConcurrencyConflictError('User', 'u-1', 1, 3);
      expect(errWithActual.message).toBe(
        'User u-1 was modified concurrently: expected version 1, found 3.',
      );
      expect(errWithActual.expectedVersion).toBe(1);
      expect(errWithActual.actualVersion).toBe(3);
    });
  });

  describe('UnknownMutableFieldError', () => {
    it('formats message when known mutable fields list is empty', () => {
      const err = new UnknownMutableFieldError('User', 'email', []);
      expect(err.message).toBe(
        "User does not declare 'email' as a mutable field. Declare it with @Mutable() or remove it from the mutation patch. Known mutable fields: (none).",
      );
      expect(err.aggregate).toBe('User');
      expect(err.field).toBe('email');
    });
  });
});
