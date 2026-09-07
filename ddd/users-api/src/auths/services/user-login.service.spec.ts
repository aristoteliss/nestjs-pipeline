/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
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

const emptyCapabilities = {
  roles: [],
  additionalCapabilities: [],
  deniedCapabilities: [],
};

describe('UserLoginService', () => {
  it('binds issued access tokens to the active tenant through the capability reader port', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    delete process.env.JWT_ALGORITHMS;
    const user = User.create('Alice', 'alice@example.test');
    const tenantContext = new TenantSchemaContext();
    const getCapabilities = vi.fn().mockResolvedValue(emptyCapabilities);
    const service = new UserLoginService(
      { find: vi.fn() } as never,
      { getCapabilities } as never,
      tenantContext,
    );

    const result = await tenantContext.run('tenant_a', () =>
      service.signToken(user),
    );

    expect(getCapabilities).toHaveBeenCalledWith(user.id);
    expect(decodeJwt(result.accessToken).tenant).toBe('tenant_a');
  });

  it('rejects local token issuance when HS256 is excluded before capability lookup', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    process.env.JWT_ALGORITHMS = 'RS256';
    const getCapabilities = vi.fn();
    const service = new UserLoginService(
      { find: vi.fn() } as never,
      { getCapabilities } as never,
      new TenantSchemaContext(),
    );
    const user = User.create('Alice', 'alice@example.test');

    await expect(service.signToken(user)).rejects.toThrow(
      'JWT_ALGORITHMS must include HS256',
    );
    expect(getCapabilities).not.toHaveBeenCalled();
  });

  it('issues unique tokens with distinct jti claims without dispatching QueryBus work', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    delete process.env.JWT_ALGORITHMS;
    const user = User.create('Alice', 'alice@example.test');
    const tenantContext = new TenantSchemaContext();
    const service = new UserLoginService(
      { find: vi.fn() } as never,
      { getCapabilities: vi.fn().mockResolvedValue(emptyCapabilities) } as never,
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
