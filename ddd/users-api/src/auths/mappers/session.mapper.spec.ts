/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { Auth } from '../domain/models/auth.entity';
import { toSessionRes } from './session.mapper';

describe('toSessionRes', () => {
  it('maps CreateAuthResult to SessionResponse DTO correctly', () => {
    const auth = Auth.create('user-1', 'token-123');
    const result = {
      aggregate: auth,
      id: 'user-1',
      tenant: 'tenant_alpha',
      email: 'user@example.test',
      department: 'Engineering',
      capabilities: {
        roles: ['admin'],
        additionalCapabilities: [],
        deniedCapabilities: [],
      },
      token: 'token-123',
      expiresAt: 12345678,
      exp: 12345,
    };

    const res = toSessionRes(result);

    expect(res).toEqual({
      id: 'user-1',
      tenant: 'tenant_alpha',
      email: 'user@example.test',
      department: 'Engineering',
      capabilities: {
        roles: ['admin'],
        additionalCapabilities: [],
        deniedCapabilities: [],
      },
      token: 'token-123',
      expiresAt: 12345678,
      exp: 12345,
    });
  });

  it('handles null department gracefully', () => {
    const auth = Auth.create('user-2', 'token-456');
    const result = {
      aggregate: auth,
      id: 'user-2',
      tenant: 'tenant_beta',
      email: 'bob@example.test',
      token: 'token-456',
    };

    const res = toSessionRes(result);

    expect(res.department).toBeNull();
    expect(res.id).toBe('user-2');
    expect(res.token).toBe('token-456');
  });
});
