import { Platform, TransformContext, Type } from '@mikro-orm/core';

export class UnixTimestampType extends Type<Date, number> {
  convertToDatabaseValue(
    value: Date | undefined | null,
    _platform?: Platform,
    _context?: TransformContext,
  ): number {
    if (value == null) return value as unknown as number;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    return new Date(value).getTime();
  }

  convertToJSValue(
    value: number | undefined | null,
    _platform?: Platform,
    _context?: TransformContext,
  ): Date {
    if (value == null) return value as unknown as Date;
    return new Date(value);
  }

  getColumnType() {
    return 'number';
  }
}
