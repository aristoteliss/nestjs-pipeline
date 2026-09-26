/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import type { ValueViolation } from '../rules/value-violation';
import { DomainException } from './domain.exception';
import { InvalidValueException } from './invalid-value.exception';

describe('InvalidValueException', () => {
  it.each<[ValueViolation, string]>([
    [{ field: 'name', rule: 'required' }, 'name is required.'],
    [
      { field: 'name', rule: 'type', expected: 'string' },
      'name must be a string.',
    ],
    [
      { field: 'name', rule: 'characters' },
      'name must not contain control characters or unpaired surrogates.',
    ],
    [
      { field: 'name', rule: 'minLength', limit: 3 },
      'name must be at least 3 characters.',
    ],
    [
      { field: 'name', rule: 'maxLength', limit: 8 },
      'name must be at most 8 characters.',
    ],
    [
      { field: 'name', rule: 'pattern' },
      'name does not match the required format.',
    ],
    [{ field: 'total', rule: 'finite' }, 'total must be a finite number.'],
    [{ field: 'total', rule: 'integer' }, 'total must be a safe integer.'],
    [{ field: 'total', rule: 'min', limit: 1 }, 'total must be at least 1.'],
    [{ field: 'total', rule: 'max', limit: 9 }, 'total must be at most 9.'],
  ])('describes the %o violation', (violation, message) => {
    const error = new InvalidValueException(violation);

    expect(error.message).toBe(message);
    expect(error.violation).toBe(violation);
  });

  it('is a DomainException named after its concrete class', () => {
    class InvalidNameException extends InvalidValueException {}
    const error = new InvalidNameException({ field: 'name', rule: 'required' });

    expect(error).toBeInstanceOf(DomainException);
    expect(error.name).toBe('InvalidNameException');
  });

  it('keeps a message given in place of the default one', () => {
    const error = new InvalidValueException(
      { field: 'name', rule: 'required' },
      'Enter a name.',
    );

    expect(error.message).toBe('Enter a name.');
  });
});
