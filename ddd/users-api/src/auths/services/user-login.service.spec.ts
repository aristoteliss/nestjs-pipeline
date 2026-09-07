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
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';
import { User } from '../../users/domain/models/user.entity';
import { UserLoginService } from './user-login.service';

const originalJwtSecret = process.env.JWT_SECRET;
const originalJwtAlgorithms = process.env.JWT_ALGORITHMS;

const capabilities = {
  roles: [],
  additionalCapabilities: [],
  deniedCapabilities: [],
};

afterEach(() => {
  if (originalJwtSecret === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = originalJwtSecret;
  if (originalJwtAlgorithms === undefined) delete process.env.JWT_ALGORITHMS;
  else process.env.JWT_ALGORITHMS = originalJwtAlgorithms;
});

describe('UserLoginService', () => {
  it('loads capabilities through the query-repository port without a nested QueryBus', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    delete process.env.JWT_ALGORITHMS;
    const user = User.create('Alice', 'alice@example.test');
    const capabilitiesRepository = { find: vi.fn().mockResolvedValue(capabilities) };
    const service = new UserLoginService(
      capabilitiesRepository as never,
      { find: vi.fn() } as never,
      new TenantSchemaContext(),
    );

    await service.signToken(user);

    expect(capabilitiesRepository.find).toHaveBeenCalledWith(
      expect.any(GetUserCapabilitiesQuery),
    );
    expect(capabilitiesRepository.find.mock.calls[0][0].userId).toBe(user.id);
  });

  it('binds issued access tokens to the active tenant', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    delete process.env.JWT_ALGORITHMS;
    const user = User.create('Alice', 'alice@example.test');
    const tenantContext = new TenantSchemaContext();
    const service = new UserLoginService(
      { find: vi.fn().mockResolvedValue(capabilities) } as never,
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
      { find: vi.fn() } as never,
      { find: vi.fn() } as never,
      new TenantSchemaContext(),
    );
    const user = User.create('Alice', 'alice@example.test');

    await expect(service.signToken(user)).rejects.toThrow(
      'JWT_ALGORITHMS must include HS256',
    );
  });

  it('issues unique tokens with distinct jti claims even for subsequent calls in the same second', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    delete process.env.JWT_ALGORITHMS;
    const user = User.create('Alice', 'alice@example.test');
    const tenantContext = new TenantSchemaContext();
    const service = new UserLoginService(
      { find: vi.fn().mockResolvedValue(capabilities) } as never,
      { find: vi.fn() } as never,
      tenantContext,
    );

    const result1 = await tenantContext.run('tenant_a', () =>
      service.signToken(user),
    );
    const result2 = await tenantContext.run('tenant_a', () =>
      service.signToken(user),
    );

    expect(result1.accessToken).not.toBe(result2.accessToken);
    const payload1 = decodeJwt(result1.accessToken);
    const payload2 = decodeJwt(result2.accessToken);
    expect(payload1.jti).toBeDefined();
    expect(payload2.jti).toBeDefined();
    expect(payload1.jti).not.toBe(payload2.jti);
  });
});
