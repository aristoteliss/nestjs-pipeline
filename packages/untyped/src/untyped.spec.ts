/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { untyped } from './untyped.js';

describe('untyped', () => {
  it('returns the same value, whose undeclared properties read as unknown', () => {
    const marker = Symbol('marker');
    const value = { declared: 1, [marker]: 'hidden' };

    const view = untyped(value);

    expect(view).toBe(value);
    expect(view[marker]).toBe('hidden');
    expect(view.missing).toBeUndefined();
  });
});
