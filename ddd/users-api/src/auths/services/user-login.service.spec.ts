/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

import { describe, expect, it, vi } from 'vitest';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';
import { InvalidLoginCredentialsException } from '../domain/errors/authentication.exception';
import { User } from '../../users/domain/models/user.entity';
import { UserLoginService } from './user-login.service';

const capabilities = {
  roles: [],
  additionalCapabilities: [],
  deniedCapabilities: [],
};

describe('UserLoginService', () => {
  it('delegates credential verification and user lookup to ports', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const verifier = { verify: vi.fn() };
    const userRepository = { find: vi.fn().mockResolvedValue(user) };
    const service = new UserLoginService(
      { find: vi.fn() } as never,
      userRepository as never,
      verifier,
      { issue: vi.fn() } as never,
    );

    await expect(
      service.authenticate('alice@example.test', '424242'),
    ).resolves.toBe(user);
    expect(verifier.verify).toHaveBeenCalledWith('424242');
    expect(userRepository.find).toHaveBeenCalledOnce();
  });

  it('returns a neutral authentication failure when the user does not exist', async () => {
    const service = new UserLoginService(
      { find: vi.fn() } as never,
      { find: vi.fn().mockResolvedValue(null) } as never,
      { verify: vi.fn() },
      { issue: vi.fn() } as never,
    );

    await expect(
      service.authenticate('missing@example.test', '424242'),
    ).rejects.toBeInstanceOf(InvalidLoginCredentialsException);
  });

  it('loads capabilities through the repository port and delegates token issuance', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const capabilitiesRepository = {
      find: vi.fn().mockResolvedValue(capabilities),
    };
    const issuer = {
      issue: vi.fn().mockResolvedValue({
        accessToken: 'issued-token',
        expiresAt: 123000,
        exp: 123,
      }),
    };
    const service = new UserLoginService(
      capabilitiesRepository as never,
      { find: vi.fn() } as never,
      { verify: vi.fn() },
      issuer,
    );

    const result = await service.signToken(user);

    expect(capabilitiesRepository.find).toHaveBeenCalledWith(
      expect.any(GetUserCapabilitiesQuery),
    );
    expect(capabilitiesRepository.find.mock.calls[0][0].userId).toBe(user.id);
    expect(issuer.issue).toHaveBeenCalledWith({ user, capabilities });
    expect(result).toEqual({
      userId: user.id,
      userCapabilities: capabilities,
      accessToken: 'issued-token',
      expiresAt: 123000,
      exp: 123,
    });
  });
});
