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

import { describe, expect, it, vi } from 'vitest';
import { User } from '../../users/domain/models/user.entity';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';
import { InvalidLoginCredentialsException } from '../domain/errors/authentication.exception';
import { UserLoginService } from './user-login.service';

const emptyCapabilities = {
  roles: [],
  additionalCapabilities: [],
  deniedCapabilities: [],
};

function createService(overrides?: {
  userRepository?: unknown;
  capabilityRepository?: unknown;
  loginCodeVerifier?: unknown;
  accessTokenIssuer?: unknown;
  jwtAuthenticator?: unknown;
}) {
  return new UserLoginService(
    (overrides?.userRepository ?? { find: vi.fn() }) as never,
    (overrides?.capabilityRepository ?? { find: vi.fn() }) as never,
    (overrides?.loginCodeVerifier ?? { verify: vi.fn() }) as never,
    (overrides?.accessTokenIssuer ?? { issue: vi.fn() }) as never,
    (overrides?.jwtAuthenticator ?? {
      extractToken: vi.fn(),
      extractUserId: vi.fn(),
    }) as never,
  );
}

describe('UserLoginService', () => {
  it('delegates credential verification and user lookup to ports', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const verifier = { verify: vi.fn() };
    const userRepository = { find: vi.fn().mockResolvedValue(user) };
    const service = createService({
      userRepository,
      loginCodeVerifier: verifier,
    });

    await expect(
      service.authenticate('alice@example.test', '424242'),
    ).resolves.toBe(user);
    expect(verifier.verify).toHaveBeenCalledWith('424242');
    expect(userRepository.find).toHaveBeenCalledOnce();
  });

  it('returns a neutral authentication failure when the user does not exist', async () => {
    const service = createService({
      userRepository: { find: vi.fn().mockResolvedValue(null) },
      loginCodeVerifier: { verify: vi.fn() },
    });

    await expect(
      service.authenticate('missing@example.test', '424242'),
    ).rejects.toBeInstanceOf(InvalidLoginCredentialsException);
  });

  it('loads capabilities through the repository port and delegates token issuance', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const capabilitiesRepository = {
      find: vi.fn().mockResolvedValue(emptyCapabilities),
    };
    const issuer = {
      issue: vi.fn().mockResolvedValue({
        accessToken: 'issued-token',
        expiresAt: 123000,
        exp: 123,
      }),
    };
    const service = createService({
      capabilityRepository: capabilitiesRepository,
      accessTokenIssuer: issuer,
    });

    const result = await service.signToken(user);

    expect(capabilitiesRepository.find).toHaveBeenCalledWith(
      expect.any(GetUserCapabilitiesQuery),
    );
    expect(capabilitiesRepository.find.mock.calls[0][0].userId).toBe(user.id);
    expect(issuer.issue).toHaveBeenCalledWith({
      user,
      capabilities: emptyCapabilities,
    });
    expect(result).toEqual({
      userId: user.id,
      userCapabilities: emptyCapabilities,
      accessToken: 'issued-token',
      expiresAt: 123000,
      exp: 123,
    });
  });

  describe('extractCredentials', () => {
    it('extracts userId from session user when session is provided', async () => {
      const mockJwtAuthenticator = {
        extractToken: vi.fn().mockReturnValue('mock-token-xyz'),
        extractUserId: vi.fn(),
      };
      const service = createService({
        jwtAuthenticator: mockJwtAuthenticator,
      });

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
      const service = createService({
        jwtAuthenticator: mockJwtAuthenticator,
      });

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
      const service = createService({
        jwtAuthenticator: mockJwtAuthenticator,
      });

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
      const service = createService({
        jwtAuthenticator: mockJwtAuthenticator,
      });

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
      const service = createService({
        jwtAuthenticator: mockJwtAuthenticator,
      });

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
      const service = createService({
        jwtAuthenticator: mockJwtAuthenticator,
      });

      const result = await service.extractCredentials(undefined, undefined);
      expect(result).toEqual({
        userId: undefined,
        token: undefined,
      });
    });
  });
});
