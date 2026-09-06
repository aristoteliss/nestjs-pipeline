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

import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { decodeJwt } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../users/domain/models/user.entity';
import { UserLoginService } from './user-login.service';

const originalJwtSecret = process.env.JWT_SECRET;
const originalJwtAlgorithms = process.env.JWT_ALGORITHMS;

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalJwtAlgorithms === undefined) delete process.env.JWT_ALGORITHMS;
  else process.env.JWT_ALGORITHMS = originalJwtAlgorithms;
});

describe('UserLoginService', () => {
  it('binds issued access tokens to the active tenant', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    delete process.env.JWT_ALGORITHMS;
    const user = User.create('Alice', 'alice@example.test');
    const tenantContext = new TenantSchemaContext();
    const service = new UserLoginService(
      {
        execute: vi.fn().mockResolvedValue({
          roles: [],
          additionalCapabilities: [],
          deniedCapabilities: [],
        }),
      } as never,
      { find: vi.fn() } as never,
      tenantContext,
    );

    const result = await tenantContext.run('tenant_a', () =>
      service.signToken(user),
    );

    expect(decodeJwt(result.accessToken).tenant).toBe('tenant_a');
  });

  it('rejects local token issuance when HS256 is excluded', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    process.env.JWT_ALGORITHMS = 'RS256';
    const service = new UserLoginService(
      { execute: vi.fn() } as never,
      { find: vi.fn() } as never,
      new TenantSchemaContext(),
    );
    const user = User.create('Alice', 'alice@example.test');

    await expect(service.signToken(user)).rejects.toThrow(
      'JWT_ALGORITHMS must include HS256',
    );
  });
});
