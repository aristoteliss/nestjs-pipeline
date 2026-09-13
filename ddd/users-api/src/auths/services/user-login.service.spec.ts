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
}) {
  return new UserLoginService(
    (overrides?.userRepository ?? { find: vi.fn() }) as never,
    (overrides?.capabilityRepository ?? { find: vi.fn() }) as never,
    (overrides?.loginCodeVerifier ?? { verify: vi.fn() }) as never,
    (overrides?.accessTokenIssuer ?? { issue: vi.fn() }) as never,
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
});
