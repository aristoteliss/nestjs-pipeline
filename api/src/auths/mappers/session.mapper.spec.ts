/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import { Auth } from '../domain/models/auth.entity';
import { toSessionRes } from './session.mapper';

const USER = '019488e0-0000-7000-8000-000000000001';

describe('toSessionRes', () => {
  const result = {
    aggregate: Auth.start(USER, 'hash', 2_000),
    id: USER,
    principalType: 'user' as const,
    tenant: 'tenant_alpha',
    email: 'user@example.test',
    department: 'Engineering',
    accessToken: 'access-123',
    accessTokenExpiresAt: 1_000,
    refreshToken: 'refresh-secret',
    sessionExpiresAt: 2_000,
  };

  it('maps the result to the response without the refresh token', () => {
    expect(toSessionRes(result)).toEqual({
      id: USER,
      principalType: 'user',
      tenant: 'tenant_alpha',
      email: 'user@example.test',
      department: 'Engineering',
      accessToken: 'access-123',
      accessTokenExpiresAt: 1_000,
    });
    expect(JSON.stringify(toSessionRes(result))).not.toContain(
      'refresh-secret',
    );
  });

  it('maps an absent department to null', () => {
    const { department: _department, ...withoutDepartment } = result;

    expect(toSessionRes(withoutDepartment).department).toBeNull();
  });
});
