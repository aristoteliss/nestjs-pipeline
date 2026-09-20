/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { CaslBehavior } from '../casl.behavior';
import { requires } from './requires';

describe('requires', () => {
  it('declares one requirement', () => {
    expect(requires({ action: 'read', subject: 'User' })).toEqual([
      CaslBehavior,
      { rules: [{ action: 'read', subject: 'User' }] },
    ]);
  });

  it('declares several requirements in order', () => {
    const tuple = requires(
      { action: 'update', subject: 'Post', field: 'title' },
      { action: 'update', subject: 'Post', field: 'body' },
    );

    expect(tuple).toHaveLength(2);
    expect(tuple[0]).toBe(CaslBehavior);
    expect(tuple[1]).toEqual({
      rules: [
        { action: 'update', subject: 'Post', field: 'title' },
        { action: 'update', subject: 'Post', field: 'body' },
      ],
    });
    expect(Object.keys(tuple[1])).toEqual(['rules']);
  });
});
