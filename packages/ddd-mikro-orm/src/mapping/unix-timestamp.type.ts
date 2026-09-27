/* Copyright (C) 2026-present Aristotelis — see repository license. */
import {
  type EntityProperty,
  Platform,
  type TransformContext,
  Type,
} from '@mikro-orm/core';

type Timestamp = Date | number | string | bigint;

/**
 * Converts a timestamp value to epoch milliseconds, or throws.
 *
 * A number, a bigint, a numeric string, a date string and a `Date` are read. A
 * blank string, `NaN`, an infinite number, an unparsable string, an invalid
 * `Date` and any other value have no valid time.
 */
function toEpochMilliseconds(value: unknown): number {
  let milliseconds = Number.NaN;
  if (value instanceof Date) milliseconds = value.getTime();
  else if (typeof value === 'number') milliseconds = value;
  else if (typeof value === 'bigint') milliseconds = Number(value);
  else if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    milliseconds = Number.isNaN(numeric) ? Date.parse(value) : numeric;
  }
  if (!Number.isFinite(milliseconds)) {
    throw new TypeError(
      `UnixTimestampType cannot read ${typeof value} value ${JSON.stringify(String(value))} as a timestamp.`,
    );
  }
  return milliseconds;
}

/**
 * MikroORM type that stores a `Date` as epoch milliseconds in a 64-bit `bigint`
 * column.
 *
 * `null` and `undefined` pass through in both directions. A value that has no
 * valid time throws a `TypeError` rather than being stored or returned as
 * `NaN`.
 */
export class UnixTimestampType extends Type<
  Date | null | undefined,
  number | null | undefined
> {
  convertToDatabaseValue(
    value: Timestamp | null | undefined,
    _platform?: Platform,
    _context?: TransformContext,
  ): number | null | undefined {
    if (value == null) return value;
    return toEpochMilliseconds(value);
  }

  convertToJSValue(
    value: Timestamp | null | undefined,
    _platform?: Platform,
    _context?: TransformContext,
  ): Date | null | undefined {
    if (value == null) return value;
    const milliseconds = toEpochMilliseconds(value);
    return value instanceof Date ? value : new Date(milliseconds);
  }

  getColumnType(
    prop: EntityProperty = {} as EntityProperty,
    platform?: Platform,
  ): string {
    return platform ? platform.getBigIntTypeDeclarationSQL(prop) : 'bigint';
  }
}
