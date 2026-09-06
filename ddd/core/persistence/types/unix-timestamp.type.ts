import {
  type EntityProperty,
  Platform,
  type TransformContext,
  Type,
} from '@mikro-orm/core';

export class UnixTimestampType extends Type<Date, number> {
  convertToDatabaseValue(
    value: Date | number | string | bigint | undefined | null,
    _platform?: Platform,
    _context?: TransformContext,
  ): number {
    if (value == null) return value as unknown as number;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
    if (typeof value === 'string') {
      const numeric = Number(value);
      return Number.isNaN(numeric) ? new Date(value).getTime() : numeric;
    }
    return new Date(value as unknown as string).getTime();
  }

  convertToJSValue(
    value: number | string | bigint | Date | undefined | null,
    _platform?: Platform,
    _context?: TransformContext,
  ): Date {
    if (value == null) return value as unknown as Date;
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'bigint') return new Date(Number(value));
    if (typeof value === 'string') {
      const numeric = Number(value);
      return new Date(Number.isNaN(numeric) ? value : numeric);
    }
    return new Date(value as unknown as number);
  }

  getColumnType(
    prop: EntityProperty = {} as EntityProperty,
    platform?: Platform,
  ): string {
    return platform ? platform.getBigIntTypeDeclarationSQL(prop) : 'bigint';
  }
}
