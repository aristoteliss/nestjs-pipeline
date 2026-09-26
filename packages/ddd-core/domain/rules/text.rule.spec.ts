/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, expectTypeOf, it } from 'vitest';
import { DomainException } from '../exceptions/domain.exception';
import { InvalidValueException } from '../exceptions/invalid-value.exception';
import { textRule } from './text.rule';
import type { ValueViolation } from './value-violation';

class InvalidNameException extends InvalidValueException {}

function violationOf(run: () => unknown): ValueViolation {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidValueException);
    return (error as InvalidValueException).violation;
  }
  throw new Error('expected a violation');
}

describe('textRule', () => {
  const name = textRule({ field: 'name', minLength: 3, maxLength: 8 });

  it('returns the text trimmed and in Unicode NFC form', () => {
    expect(name.parse('  Lead  ')).toBe('Lead');
    expect(name.parse('Café')).toBe('Café');
  });

  it('keeps inner whitespace and paired surrogates', () => {
    expect(name.parse('a  b')).toBe('a  b');
    expect(name.parse('ok\u{1F600}')).toBe('ok\u{1F600}');
  });

  it('rejects null, undefined and blank text when required', () => {
    for (const value of [null, undefined, '', '   ', '\n\t']) {
      expect(violationOf(() => name.parse(value))).toEqual({
        field: 'name',
        rule: 'required',
      });
    }
  });

  it('normalizes null, undefined and blank text to null when not required', () => {
    const department = textRule({ field: 'department', required: false });

    expect(department.parse(null)).toBeNull();
    expect(department.parse(undefined)).toBeNull();
    expect(department.parse('   ')).toBeNull();
    expect(department.parse(' Sales ')).toBe('Sales');
  });

  it('rejects a value that is not a string', () => {
    expect(violationOf(() => name.parse(42))).toEqual({
      field: 'name',
      rule: 'type',
      expected: 'string',
    });
  });

  it('rejects an unpaired high or low surrogate', () => {
    for (const value of ['ab\uD800c', 'ab\uDC00c', 'abc\uD83D']) {
      expect(violationOf(() => name.parse(value))).toEqual({
        field: 'name',
        rule: 'characters',
      });
    }
  });

  it('rejects control characters, line breaks and tabs in single-line text', () => {
    for (const value of ['a\u0000bc', 'a\nbc', 'a\tbc', 'a\u0085bc']) {
      expect(violationOf(() => name.parse(value))).toEqual({
        field: 'name',
        rule: 'characters',
      });
    }
  });

  it('accepts tabs and line breaks but no other control character in multiline text', () => {
    const note = textRule({ field: 'note', multiline: true });

    expect(note.parse('a\r\n\tb')).toBe('a\r\n\tb');
    expect(violationOf(() => note.parse('a\u0007b'))).toEqual({
      field: 'note',
      rule: 'characters',
    });
  });

  it('enforces minLength and maxLength on the normalized text, bounds included', () => {
    expect(name.parse('abc')).toBe('abc');
    expect(name.parse('abcdefgh')).toBe('abcdefgh');
    expect(violationOf(() => name.parse(' ab '))).toEqual({
      field: 'name',
      rule: 'minLength',
      limit: 3,
    });
    expect(violationOf(() => name.parse('abcdefghi'))).toEqual({
      field: 'name',
      rule: 'maxLength',
      limit: 8,
    });
  });

  it('enforces the pattern on the normalized text', () => {
    const slug = textRule({ field: 'slug', pattern: /^[a-z-]+$/ });

    expect(slug.parse(' sales-team ')).toBe('sales-team');
    expect(violationOf(() => slug.parse('Sales'))).toEqual({
      field: 'slug',
      rule: 'pattern',
    });
  });

  it('throws the error the factory builds, with the violation frozen', () => {
    const rule = textRule({
      field: 'name',
      minLength: 3,
      error: (violation) => new InvalidNameException(violation),
    });

    expect(() => rule.parse('ab')).toThrow(InvalidNameException);
    expect(() => rule.parse('ab')).toThrow(
      'name must be at least 3 characters.',
    );
    const violation = violationOf(() => rule.parse('ab'));
    expect(Object.isFrozen(violation)).toBe(true);
  });

  it('throws InvalidValueException, a DomainException, by default', () => {
    expect(() => name.parse(null)).toThrow(DomainException);
    expect(() => name.parse(null)).toThrow('name is required.');
  });

  it('exposes its options on a frozen rule whose parse needs no binding', () => {
    const { parse } = name;

    expect(name.field).toBe('name');
    expect(name.minLength).toBe(3);
    expect(name.maxLength).toBe(8);
    expect(Object.isFrozen(name)).toBe(true);
    expect(parse(' abc ')).toBe('abc');
  });

  it('types parse as string when required and as string | null otherwise', () => {
    expectTypeOf(name.parse).returns.toEqualTypeOf<string>();
    expectTypeOf(
      textRule({ field: 'a', required: true }).parse,
    ).returns.toEqualTypeOf<string>();
    expectTypeOf(
      textRule({ field: 'a', required: false }).parse,
    ).returns.toEqualTypeOf<string | null>();
    expectTypeOf(name.minLength).toEqualTypeOf<3>();
  });

  it('rejects invalid options with TypeError', () => {
    expect(() => textRule({ field: '' })).toThrow(
      'textRule: field must be a non-empty string.',
    );
    expect(() => textRule({ field: '  ' })).toThrow(TypeError);
    expect(() => textRule({ field: 1 as unknown as string })).toThrow(
      TypeError,
    );
    expect(() => textRule({ field: 'a', minLength: -1 })).toThrow(
      'textRule: minLength must be a non-negative integer.',
    );
    expect(() => textRule({ field: 'a', maxLength: 1.5 })).toThrow(
      'textRule: maxLength must be a non-negative integer.',
    );
    expect(() => textRule({ field: 'a', minLength: 4, maxLength: 3 })).toThrow(
      'textRule: minLength must not exceed maxLength.',
    );
    expect(() => textRule({ field: 'a', pattern: /a/g })).toThrow(
      'textRule: pattern must not use the g or y flag.',
    );
    expect(() => textRule({ field: 'a', pattern: /a/y })).toThrow(TypeError);
  });
});
