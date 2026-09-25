/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { isUuidV7, uuidv7 } from './uuidv7';

const UUID_V7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('uuidv7', () => {
  it('generates a valid RFC 9562 UUIDv7 string', () => {
    const id = uuidv7();

    expect(typeof id).toBe('string');
    expect(id).toMatch(UUID_V7_REGEX);
    expect(id.length).toBe(36);
    expect(isUuidV7(id)).toBe(true);
  });

  it('generates unique IDs in rapid succession', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(uuidv7());
    }
    expect(ids.size).toBe(1000);
  });

  it('generates timestamp-sortable UUIDs across different milliseconds', async () => {
    const id1 = uuidv7();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const id2 = uuidv7();

    expect(id1 < id2).toBe(true);
  });
});

describe('isUuidV7', () => {
  it('validates UUIDv7 strings after trimming surrounding whitespace', () => {
    const id = uuidv7();
    expect(isUuidV7(`  ${id}\n`)).toBe(true);
  });

  it('accepts uppercase hex digits', () => {
    expect(isUuidV7(uuidv7().toUpperCase())).toBe(true);
  });

  it('rejects non-string inputs', () => {
    expect(isUuidV7(null)).toBe(false);
    expect(isUuidV7(undefined)).toBe(false);
    expect(isUuidV7(12345)).toBe(false);
    expect(isUuidV7({})).toBe(false);
  });

  it('rejects empty and whitespace-only strings', () => {
    expect(isUuidV7('')).toBe(false);
    expect(isUuidV7('   ')).toBe(false);
    expect(isUuidV7('   \t\n  ')).toBe(false);
  });

  it('rejects invalid formats, other versions and the wrong variant', () => {
    expect(isUuidV7('not-a-uuid')).toBe(false);
    expect(isUuidV7('00000000-0000-0000-0000-000000000000')).toBe(false);
    expect(isUuidV7('00000000-0000-4000-8000-000000000000')).toBe(false); // v4, not v7
    expect(isUuidV7('01923456-789a-7000-c000-000000000000')).toBe(false); // variant 0b11
  });
});
