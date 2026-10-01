/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { toReference } from './principal-reference.js';

describe('toReference', () => {
  it('keeps only the identity fields', () => {
    const principal = {
      id: 'u-1',
      type: 'user',
      sessionId: 's-1',
      grants: ['all|manage'],
      email: 'a@example.test',
    };

    expect(toReference(principal)).toEqual({
      id: 'u-1',
      type: 'user',
      sessionId: 's-1',
    });
  });

  it('omits an absent session id', () => {
    expect(toReference({ id: 'svc', type: 'service' })).toEqual({
      id: 'svc',
      type: 'service',
    });
  });
});
