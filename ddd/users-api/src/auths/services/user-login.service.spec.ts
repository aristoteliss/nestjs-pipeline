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
    const mockJwtAuthenticator = {
      extractToken: vi.fn(),
      extractUserId: vi.fn(),
    };
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
      mockJwtAuthenticator as never,
    );

    const result = await tenantContext.run('tenant_a', () =>
      service.signToken(user),
    );

    expect(decodeJwt(result.accessToken).tenant).toBe('tenant_a');
  });

  it('rejects local token issuance when HS256 is excluded', async () => {
    process.env.JWT_SECRET = 'tenant-bound-token-secret';
    process.env.JWT_ALGORITHMS = 'RS256';
    const mockJwtAuthenticator = {
      extractToken: vi.fn(),
      extractUserId: vi.fn(),
    };
    const service = new UserLoginService(
      { execute: vi.fn() } as never,
      { find: vi.fn() } as never,
      new TenantSchemaContext(),
      mockJwtAuthenticator as never,
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
    const mockJwtAuthenticator = {
      extractToken: vi.fn(),
      extractUserId: vi.fn(),
    };
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
      mockJwtAuthenticator as never,
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

  describe('extractCredentials', () => {
    it('extracts userId from session user when session is provided', async () => {
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue('mock-token-xyz'),
        extractUserId: vi.fn(),
      };
      const service = new UserLoginService(
        { execute: vi.fn() } as never,
        { find: vi.fn() } as never,
        new TenantSchemaContext(),
        mockJwtAuthenticator as never,
      );

      const session = {
        user: { id: 'usr-session-1', tenant: 'tenant_a' },
      };

      const result = await service.extractCredentials(session as never, {
        authorization: 'Bearer mock-token-xyz',
      });

      expect(result).toEqual({
        userId: 'usr-session-1',
        token: 'mock-token-xyz',
      });
      expect(mockJwtAuthenticator.extractToken).toHaveBeenCalledWith({
        authorization: 'Bearer mock-token-xyz',
      });
      expect(mockJwtAuthenticator.extractUserId).not.toHaveBeenCalled();
    });

    it('extracts userId via JwtAuthenticator when session user is absent', async () => {
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue('bearer-token-123'),
        extractUserId: vi.fn().mockResolvedValue('usr-from-jwt'),
      };
      const service = new UserLoginService(
        { execute: vi.fn() } as never,
        { find: vi.fn() } as never,
        new TenantSchemaContext(),
        mockJwtAuthenticator as never,
      );

      const headers = { authorization: 'Bearer bearer-token-123' };
      const result = await service.extractCredentials(undefined, headers);

      expect(result).toEqual({
        userId: 'usr-from-jwt',
        token: 'bearer-token-123',
      });
      expect(mockJwtAuthenticator.extractToken).toHaveBeenCalledWith(headers);
      expect(mockJwtAuthenticator.extractUserId).toHaveBeenCalledWith(headers);
    });

    it('supports passing raw request object with session and headers', async () => {
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue('req-token'),
        extractUserId: vi.fn().mockResolvedValue('req-user-id'),
      };
      const service = new UserLoginService(
        { execute: vi.fn() } as never,
        { find: vi.fn() } as never,
        new TenantSchemaContext(),
        mockJwtAuthenticator as never,
      );

      const req = {
        session: { user: { id: 'req-user-id', tenant: 'tenant_a' } },
        headers: { authorization: 'Bearer req-token' },
      };

      const result = await service.extractCredentials(req as never);
      expect(result).toEqual({
        userId: 'req-user-id',
        token: 'req-token',
      });
    });

    it('extracts token and userId from cookie session without headers', async () => {
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue(undefined),
        extractUserId: vi.fn(),
      };
      const service = new UserLoginService(
        { execute: vi.fn() } as never,
        { find: vi.fn() } as never,
        new TenantSchemaContext(),
        mockJwtAuthenticator as never,
      );

      const session = {
        user: { id: 'session-usr-1', tenant: 'tenant_a' },
        token: 'cookie-session-token',
      };

      const result = await service.extractCredentials(session as never);
      expect(result).toEqual({
        userId: 'session-usr-1',
        token: 'cookie-session-token',
      });
      expect(mockJwtAuthenticator.extractUserId).not.toHaveBeenCalled();
    });

    it('extracts token using session.get("token") method when present', async () => {
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue(undefined),
        extractUserId: vi.fn(),
      };
      const service = new UserLoginService(
        { execute: vi.fn() } as never,
        { find: vi.fn() } as never,
        new TenantSchemaContext(),
        mockJwtAuthenticator as never,
      );

      const session = {
        user: { id: 'usr-getter-1', tenant: 'tenant_a' },
        get: vi.fn((key: string) =>
          key === 'token' ? 'token-from-getter' : undefined,
        ),
      };

      const result = await service.extractCredentials(session as never);
      expect(result).toEqual({
        userId: 'usr-getter-1',
        token: 'token-from-getter',
      });
      expect(session.get).toHaveBeenCalledWith('token');
    });

    it('returns undefined for userId and token when neither session nor headers exist', async () => {
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue(undefined),
        extractUserId: vi.fn().mockResolvedValue(undefined),
      };
      const service = new UserLoginService(
        { execute: vi.fn() } as never,
        { find: vi.fn() } as never,
        new TenantSchemaContext(),
        mockJwtAuthenticator as never,
      );

      const result = await service.extractCredentials(undefined, undefined);
      expect(result).toEqual({
        userId: undefined,
        token: undefined,
      });
    });
  });
});
