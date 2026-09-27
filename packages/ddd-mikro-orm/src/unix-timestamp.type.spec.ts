/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { UnixTimestampType } from './unix-timestamp.type';

describe('UnixTimestampType', () => {
  const type = new UnixTimestampType();

  it('converts Date to numeric unix timestamp in milliseconds', () => {
    const now = new Date('2026-08-24T12:00:00.000Z');
    const result = type.convertToDatabaseValue(now);
    expect(result).toBe(now.getTime());
  });

  it('passes through null and undefined in convertToDatabaseValue', () => {
    expect(type.convertToDatabaseValue(null)).toBeNull();
    expect(type.convertToDatabaseValue(undefined)).toBeUndefined();
  });

  it('converts number timestamp to Date object in convertToJSValue', () => {
    const ts = 1787572800000;
    const result = type.convertToJSValue(ts);
    expect(result).toEqual(new Date(ts));
  });

  it('converts string number timestamp to Date object in convertToJSValue', () => {
    const ts = 1787572800000;
    const result = type.convertToJSValue(String(ts));
    expect(result).toEqual(new Date(ts));
  });

  it('converts bigint timestamp to Date object in convertToJSValue', () => {
    const ts = 1787572800000;
    const result = type.convertToJSValue(BigInt(ts));
    expect(result).toEqual(new Date(ts));
  });

  it('converts string and bigint to numeric millisecond timestamp in convertToDatabaseValue', () => {
    const ts = 1787572800000;
    expect(type.convertToDatabaseValue(String(ts))).toBe(ts);
    expect(type.convertToDatabaseValue(BigInt(ts))).toBe(ts);
  });

  it('passes through null and undefined in convertToJSValue', () => {
    expect(type.convertToJSValue(null)).toBeNull();
    expect(type.convertToJSValue(undefined)).toBeUndefined();
  });

  it('specifies bigint column type by default', () => {
    expect(type.getColumnType()).toBe('bigint');
  });

  it('delegates to platform.getBigIntTypeDeclarationSQL when platform is provided', () => {
    const platform = {
      getBigIntTypeDeclarationSQL: () => 'BIGINT_CUSTOM_SQL',
    };
    expect(type.getColumnType({} as never, platform as never)).toBe(
      'BIGINT_CUSTOM_SQL',
    );
  });

  it('handles Date instance directly in convertToJSValue', () => {
    const d = new Date('2026-08-24T12:00:00.000Z');
    expect(type.convertToJSValue(d)).toBe(d);
  });

  it('converts a date string in convertToDatabaseValue', () => {
    const isoStr = '2026-08-24T12:00:00.000Z';
    expect(type.convertToDatabaseValue(isoStr)).toBe(
      new Date(isoStr).getTime(),
    );
  });

  it.each([
    ['an unparsable string', 'not a date'],
    ['a blank string', '  '],
    ['NaN', Number.NaN],
    ['an infinite number', Number.POSITIVE_INFINITY],
    ['an invalid Date', new Date('invalid')],
    ['a value outside the supported types', { toString: () => '2026' }],
  ])('rejects %s in both directions', (_label, value) => {
    const unreadable = value as Parameters<
      UnixTimestampType['convertToDatabaseValue']
    >[0];

    expect(() => type.convertToDatabaseValue(unreadable)).toThrow(
      /cannot read .* as a timestamp/,
    );
    expect(() => type.convertToJSValue(unreadable)).toThrow(TypeError);
  });

  it('converts number directly in convertToDatabaseValue', () => {
    const ts = 1787572800000;
    expect(type.convertToDatabaseValue(ts)).toBe(ts);
  });

  it('converts ISO string in convertToJSValue', () => {
    const iso = '2026-08-24T12:00:00.000Z';
    const result = type.convertToJSValue(iso);
    expect(result).toEqual(new Date(iso));
  });
});
