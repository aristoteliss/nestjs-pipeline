/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBe(ts);
  });

  it('passes through null and undefined in convertToJSValue', () => {
    expect(type.convertToJSValue(null)).toBeNull();
    expect(type.convertToJSValue(undefined)).toBeUndefined();
  });

  it('specifies number column type', () => {
    expect(type.getColumnType()).toBe('number');
  });
});

