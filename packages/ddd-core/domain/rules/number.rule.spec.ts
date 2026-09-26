/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { InvalidValueException } from '../exceptions/invalid-value.exception';
import { numberRule } from './number.rule';
import type { ValueViolation } from './value-violation';

class InvalidQuantityException extends InvalidValueException {}

function violationOf(run: () => unknown): ValueViolation {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidValueException);
    return (error as InvalidValueException).violation;
  }
  throw new Error('expected a violation');
}

describe('numberRule', () => {
  const quantity = numberRule({
    field: 'quantity',
    integer: true,
    min: 1,
    max: 100,
  });

  it('returns a valid value unchanged, bounds included', () => {
    expect(quantity.parse(1)).toBe(1);
    expect(quantity.parse(100)).toBe(100);
    expect(numberRule({ field: 'ratio' }).parse(0.25)).toBe(0.25);
  });

  it('rejects null and undefined when required', () => {
    for (const value of [null, undefined]) {
      expect(violationOf(() => quantity.parse(value))).toEqual({
        field: 'quantity',
        rule: 'required',
      });
    }
  });

  it('normalizes null and undefined to null when not required', () => {
    const revokedAt = numberRule({ field: 'revokedAt', required: false });

    expect(revokedAt.parse(null)).toBeNull();
    expect(revokedAt.parse(undefined)).toBeNull();
    expect(revokedAt.parse(5)).toBe(5);
  });

  it('rejects a value that is not a number, numeric strings included', () => {
    for (const value of ['5', 5n, true]) {
      expect(violationOf(() => quantity.parse(value))).toEqual({
        field: 'quantity',
        rule: 'type',
        expected: 'number',
      });
    }
  });

  it('rejects NaN and infinities', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -Infinity]) {
      expect(violationOf(() => quantity.parse(value))).toEqual({
        field: 'quantity',
        rule: 'finite',
      });
    }
  });

  it('rejects a fraction or an unsafe integer when integer is set', () => {
    for (const value of [1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(
        violationOf(() =>
          numberRule({ field: 'quantity', integer: true }).parse(value),
        ),
      ).toEqual({ field: 'quantity', rule: 'integer' });
    }
  });

  it('enforces min and max', () => {
    expect(violationOf(() => quantity.parse(0))).toEqual({
      field: 'quantity',
      rule: 'min',
      limit: 1,
    });
    expect(violationOf(() => quantity.parse(101))).toEqual({
      field: 'quantity',
      rule: 'max',
      limit: 100,
    });
  });

  it('throws the error the factory builds', () => {
    const rule = numberRule({
      field: 'quantity',
      min: 1,
      error: (violation) => new InvalidQuantityException(violation),
    });

    expect(() => rule.parse(0)).toThrow(InvalidQuantityException);
    expect(() => rule.parse(0)).toThrow('quantity must be at least 1.');
  });

  it('exposes its options on a frozen rule whose parse needs no binding', () => {
    const { parse } = quantity;

    expect(quantity.min).toBe(1);
    expect(quantity.max).toBe(100);
    expect(Object.isFrozen(quantity)).toBe(true);
    expect(parse(7)).toBe(7);
  });

  it('types parse as number when required and as number | null otherwise', () => {
    expectTypeOf(quantity.parse).returns.toEqualTypeOf<number>();
    expectTypeOf(
      numberRule({ field: 'a', required: false }).parse,
    ).returns.toEqualTypeOf<number | null>();
    expectTypeOf(quantity.max).toEqualTypeOf<100>();
  });

  it('rejects invalid options with TypeError', () => {
    expect(() => numberRule({ field: '' })).toThrow(
      'numberRule: field must be a non-empty string.',
    );
    expect(() => numberRule({ field: 'a', min: Number.NaN })).toThrow(
      'numberRule: min must be a finite number.',
    );
    expect(() => numberRule({ field: 'a', max: Infinity })).toThrow(
      'numberRule: max must be a finite number.',
    );
    expect(() => numberRule({ field: 'a', min: 2, max: 1 })).toThrow(
      'numberRule: min must not exceed max.',
    );
  });
});
