/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { isUuidV7, uuidv7 } from './uuidv7';

describe('uuidv7 and isUuidV7', () => {
  it('generates a valid UUIDv7 string', () => {
    const id = uuidv7();
    expect(typeof id).toBe('string');
    expect(isUuidV7(id)).toBe(true);
  });

  it('rejects non-string inputs in isUuidV7', () => {
    expect(isUuidV7(123)).toBe(false);
    expect(isUuidV7(null)).toBe(false);
    expect(isUuidV7(undefined)).toBe(false);
    expect(isUuidV7({})).toBe(false);
  });

  it('rejects empty or whitespace-only strings in isUuidV7', () => {
    expect(isUuidV7('')).toBe(false);
    expect(isUuidV7('   ')).toBe(false);
  });

  it('rejects invalid UUID formats', () => {
    expect(isUuidV7('not-a-uuid')).toBe(false);
    expect(isUuidV7('00000000-0000-0000-0000-000000000000')).toBe(false);
  });
});
