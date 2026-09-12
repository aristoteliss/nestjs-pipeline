/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
