/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { uuidv7 } from './uuidv7';

const random = vi.hoisted(() => ({ fill: 0x00 }));

vi.mock('node:crypto', () => ({
  randomBytes: (size: number) => Buffer.alloc(size, random.fill),
}));

/** 2024-09-27T16:35:35.194Z, whose 48-bit form is 0x01923456789a. */
const TIMESTAMP = 0x0192_3456_789a;

describe('uuidv7 bit layout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('puts the millisecond timestamp in the first 48 bits and clears the version and variant bits', () => {
    vi.spyOn(Date, 'now').mockReturnValue(TIMESTAMP);
    random.fill = 0x00;

    expect(uuidv7()).toBe('01923456-789a-7000-8000-000000000000');
  });

  it('keeps every random bit outside the version and variant fields', () => {
    vi.spyOn(Date, 'now').mockReturnValue(TIMESTAMP);
    random.fill = 0xff;

    expect(uuidv7()).toBe('01923456-789a-7fff-bfff-ffffffffffff');
  });

  it('encodes the largest 48-bit timestamp without overflow', () => {
    vi.spyOn(Date, 'now').mockReturnValue(2 ** 48 - 1);
    random.fill = 0x00;

    expect(uuidv7()).toBe('ffffffff-ffff-7000-8000-000000000000');
  });
});
