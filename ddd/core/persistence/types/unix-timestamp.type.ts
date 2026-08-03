import { Platform, TransformContext, Type } from '@mikro-orm/core';

export class UnixTimestampType extends Type<Date, number> {
  convertToDatabaseValue(
    value: Date | undefined | null,
    _platform?: Platform,
    _context?: TransformContext,
  ): any {
    if (value == null) return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    return new Date(value).getTime();
  }

  convertToJSValue(
    value: number | undefined | null,
    _platform?: Platform,
    _context?: TransformContext,
  ): any {
    if (value == null) return value;
    return new Date(value);
  }

  getColumnType() {
    return 'number';
  }
}
