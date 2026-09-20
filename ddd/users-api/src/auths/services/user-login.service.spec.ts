/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { User } from '../../users/domain/models/user.entity';
import { InvalidLoginCredentialsException } from '../domain/errors/authentication.exception';
import { UserLoginService } from './user-login.service';

function createService(overrides?: {
  userRepository?: unknown;
  loginCodeVerifier?: unknown;
  accessTokenIssuer?: unknown;
  permissionsInAccessToken?: boolean;
  permissionRules?: unknown;
}) {
  return new UserLoginService(
    (overrides?.userRepository ?? { find: vi.fn() }) as never,
    (overrides?.loginCodeVerifier ?? { verify: vi.fn() }) as never,
    (overrides?.accessTokenIssuer ?? { issue: vi.fn() }) as never,
    {
      refreshTokenTtlSeconds: 3600,
      refreshReuseGraceSeconds: 30,
      permissionsInAccessToken: overrides?.permissionsInAccessToken ?? false,
    },
    (overrides?.permissionRules ?? { findOrdered: vi.fn() }) as never,
  );
}

describe('UserLoginService', () => {
  it('delegates credential verification and user lookup to ports with user context', async () => {
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
    expect(verifier.verify).toHaveBeenCalledWith({
      userId: user.id,
      code: '424242',
    });
    expect(userRepository.find).toHaveBeenCalledOnce();
  });

  it('returns a neutral authentication failure when the user does not exist', async () => {
    const verifier = { verify: vi.fn() };
    const service = createService({
      userRepository: { find: vi.fn().mockResolvedValue(null) },
      loginCodeVerifier: verifier,
    });

    await expect(
      service.authenticate('missing@example.test', '424242'),
    ).rejects.toBeInstanceOf(InvalidLoginCredentialsException);
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('delegates token issuance without loading permissions', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const issuer = {
      issue: vi.fn().mockResolvedValue({
        accessToken: 'issued-token',
        expiresAt: 123000,
      }),
    };
    const service = createService({ accessTokenIssuer: issuer });

    const result = await service.signToken(user, 'session-1');

    expect(issuer.issue).toHaveBeenCalledWith({ user, sessionId: 'session-1' });
    expect(result).toEqual({
      userId: user.id,
      accessToken: 'issued-token',
      expiresAt: 123000,
    });
  });

  it('reads no permissions when they are not carried in the token', async () => {
    const permissionRules = { findOrdered: vi.fn() };
    const issuer = { issue: vi.fn().mockResolvedValue({ accessToken: 't' }) };
    const user = User.create('Alice', 'alice@example.test');

    await createService({
      accessTokenIssuer: issuer,
      permissionRules,
    }).signToken(user, 'session-1');

    expect(permissionRules.findOrdered).not.toHaveBeenCalled();
    expect(issuer.issue.mock.calls[0][0]).not.toHaveProperty('permissions');
  });

  it('hands the ordered rules to the issuer when they are carried in the token', async () => {
    const rules = [
      { subject: 'User', action: 'read' },
      { subject: 'User', action: 'delete', inverted: true },
    ];
    const permissionRules = { findOrdered: vi.fn().mockResolvedValue(rules) };
    const issuer = { issue: vi.fn().mockResolvedValue({ accessToken: 't' }) };
    const user = User.create('Alice', 'alice@example.test');

    await createService({
      accessTokenIssuer: issuer,
      permissionRules,
      permissionsInAccessToken: true,
    }).signToken(user, 'session-1');

    expect(permissionRules.findOrdered).toHaveBeenCalledWith(user.id);
    expect(issuer.issue).toHaveBeenCalledWith({
      user,
      sessionId: 'session-1',
      permissions: rules,
    });
  });
});
