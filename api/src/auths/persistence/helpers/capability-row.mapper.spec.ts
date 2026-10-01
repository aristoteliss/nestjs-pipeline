/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { capabilityFromRow } from './capability-row.mapper.js';

describe('capabilityFromRow', () => {
  it('maps a full row with conditions, fields, inverted, and reason', () => {
    const result = capabilityFromRow({
      subject: 'User',
      action: 'read',
      conditions: JSON.stringify({ department: 'engineering' }),
      fields: 'id,username,email',
      inverted: true,
      reason: 'Department-restricted',
    });

    expect(result).toEqual({
      subject: 'User',
      action: 'read',
      conditions: { department: 'engineering' },
      fields: ['id', 'username', 'email'],
      inverted: true,
      reason: 'Department-restricted',
    });
  });

  it('maps a minimal row with null or undefined optional attributes', () => {
    const result = capabilityFromRow({
      subject: 'Role',
      action: 'manage',
      conditions: null,
      fields: null,
      inverted: false,
      reason: null,
    });

    expect(result).toEqual({
      subject: 'Role',
      action: 'manage',
      conditions: undefined,
      fields: undefined,
      inverted: false,
      reason: undefined,
    });
  });

  it('treats empty string reason as undefined', () => {
    const result = capabilityFromRow({
      subject: 'Role',
      action: 'read',
      inverted: false,
      reason: '',
    });

    expect(result.reason).toBeUndefined();
  });
});
