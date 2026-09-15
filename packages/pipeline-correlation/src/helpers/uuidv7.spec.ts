/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { uuidv7 } from './uuidv7';

describe('uuidv7 (correlation helper)', () => {
  const UUID_V7_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  it('generates a valid UUIDv7 format', () => {
    const id = uuidv7();
    expect(id).toMatch(UUID_V7_REGEX);
  });

  it('generates unique values', () => {
    const set = new Set(Array.from({ length: 500 }, () => uuidv7()));
    expect(set.size).toBe(500);
  });
});
