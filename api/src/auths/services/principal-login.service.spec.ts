/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { setTenantResolver } from '@cqrs-ddd/core/application';
import { ConcurrencyConflictError } from '@cqrs-ddd/core/domain';
import { RateLimitExceededError } from '@cqrs-ddd/pipeline-rate-limit';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../users/domain/models/user.entity.js';
import { InvalidLoginCredentialsException } from '../domain/errors/authentication.exception.js';
import { InvalidRefreshTokenError } from '../domain/errors/refresh-token.errors.js';
import { Auth } from '../domain/models/auth.entity.js';
import { PrincipalLoginService } from './principal-login.service.js';

const TENANT = 'tenant';

beforeEach(() => setTenantResolver(() => TENANT));
afterEach(() => setTenantResolver(currentTenantId));

function createService(overrides?: {
  userRepository?: unknown;
  loginCodeVerifier?: unknown;
  accessTokenIssuer?: unknown;
  embedPermissions?: boolean;
  permissionRules?: unknown;
  authByTokenHash?: unknown;
  authByConsumedTokenHash?: unknown;
  authRepository?: unknown;
  refreshTokens?: unknown;
  cookies?: unknown;
  eventBus?: unknown;
  rateLimiter?: unknown;
}) {
  return new PrincipalLoginService(
    (overrides?.userRepository ?? { find: vi.fn() }) as never,
    (overrides?.loginCodeVerifier ?? { verify: vi.fn() }) as never,
    (overrides?.accessTokenIssuer ?? { issue: vi.fn() }) as never,
    {
      refreshTokenTtlSeconds: 3600,
      refreshReuseGraceSeconds: 30,
      embedPermissions: overrides?.embedPermissions ?? false,
    },
    (overrides?.permissionRules ?? { find: vi.fn() }) as never,
    (overrides?.authByTokenHash ?? { find: vi.fn() }) as never,
    (overrides?.authByConsumedTokenHash ?? { find: vi.fn() }) as never,
    (overrides?.authRepository ?? {
      findById: vi.fn(),
      save: vi.fn(),
    }) as never,
    (overrides?.refreshTokens ?? {
      hash: (t: string) => `hash:${t}`,
      generate: () => 'token-next',
    }) as never,
    (overrides?.cookies ?? { save: vi.fn(), clear: vi.fn() }) as never,
    overrides?.eventBus as never,
    overrides?.rateLimiter as never,
  );
}

describe('PrincipalLoginService', () => {
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

  it('issues the token without reading permissions when they are not carried in the token', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const permissionRules = { find: vi.fn() };
    const issuer = {
      issue: vi.fn().mockResolvedValue({
        accessToken: 'issued-token',
        expiresAt: 123000,
      }),
    };
    const service = createService({
      accessTokenIssuer: issuer,
      permissionRules,
    });

    const result = await service.sign(user, 'session-1');

    expect(permissionRules.find).not.toHaveBeenCalled();
    expect(issuer.issue).toHaveBeenCalledWith({ user, sessionId: 'session-1' });
    expect(result).toEqual({ accessToken: 'issued-token', expiresAt: 123000 });
  });

  it('hands the ordered rules to the issuer when they are carried in the token', async () => {
    const rules = [
      { subject: 'User', action: 'read' },
      { subject: 'User', action: 'delete', inverted: true },
    ];
    const permissionRules = { find: vi.fn().mockResolvedValue(rules) };
    const issuer = { issue: vi.fn().mockResolvedValue({ accessToken: 't' }) };
    const user = User.create('Alice', 'alice@example.test');

    await createService({
      accessTokenIssuer: issuer,
      permissionRules,
      embedPermissions: true,
    }).sign(user, 'session-1');

    expect(permissionRules.find).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, refresh: true }),
    );
    expect(issuer.issue).toHaveBeenCalledWith({
      user,
      sessionId: 'session-1',
      permissions: rules,
    });
  });

  it('rate-limits refreshes per client IP and tenant without exposing the refresh token', async () => {
    const consume = vi
      .fn()
      .mockResolvedValue({ msBeforeNext: 0, remainingPoints: 59 });
    const authByTokenHash = { find: vi.fn().mockResolvedValue(null) };
    const authByConsumedTokenHash = { find: vi.fn().mockResolvedValue(null) };
    const service = createService({
      rateLimiter: { consume, points: 60 },
      authByTokenHash,
      authByConsumedTokenHash,
    });

    await expect(
      service.refresh('secret-token-123', '203.0.113.7'),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);

    expect(consume).toHaveBeenCalledWith(
      expect.stringContaining('203.0.113.7'),
      1,
    );
    const [key] = consume.mock.calls[0] as [string];
    expect(key).toContain('tenant');
    expect(key).not.toContain('secret-token-123');
  });

  it('throws RateLimitExceededError when the rate limiter rejects with RateLimiterRes', async () => {
    const consume = vi.fn().mockRejectedValue({
      msBeforeNext: 1500,
      remainingPoints: 0,
    });
    const service = createService({
      rateLimiter: { consume, points: 60 },
    });

    await expect(
      service.refresh('token', '203.0.113.7'),
    ).rejects.toBeInstanceOf(RateLimitExceededError);
  });

  it('re-throws unexpected rate limiter errors', async () => {
    const error = new Error('Redis connection failed');
    const consume = vi.fn().mockRejectedValue(error);
    const service = createService({
      rateLimiter: { consume, points: 60 },
    });

    await expect(service.refresh('token', '203.0.113.7')).rejects.toThrow(
      error,
    );
  });

  describe('revoke', () => {
    it('returns the session without a write when revocation is already persisted', async () => {
      const auth = Auth.create('user-1', 'hash-1', Date.now() + 10_000);
      auth.revoke(Date.now());
      auth.acknowledgePersisted();
      const save = vi.fn();
      const service = createService({ authRepository: { save } });

      const result = await service.revoke(auth, Date.now());

      expect(result).toBe(auth);
      expect(save).not.toHaveBeenCalled();
    });

    it('marks the session revoked and saves it', async () => {
      const auth = Auth.create('user-1', 'hash-1', Date.now() + 10_000);
      auth.acknowledgePersisted();
      const save = vi.fn().mockResolvedValue(undefined);
      const service = createService({ authRepository: { save } });
      const now = Date.now();

      const result = await service.revoke(auth, now);

      expect(result).toBe(auth);
      expect(auth.revokedAt).toBe(now);
      expect(save).toHaveBeenCalledWith(auth);
    });

    it('retries on concurrency conflict reloading the current aggregate', async () => {
      const auth = Auth.create('user-1', 'hash-1', Date.now() + 10_000);
      auth.acknowledgePersisted();
      const reloaded = Auth.create('user-1', 'hash-2', Date.now() + 10_000);
      reloaded.acknowledgePersisted();
      const save = vi
        .fn()
        .mockRejectedValueOnce(
          new ConcurrencyConflictError('Auth', auth.id, 1, 2),
        )
        .mockResolvedValueOnce(undefined);
      const findById = vi.fn().mockResolvedValue(reloaded);
      const service = createService({ authRepository: { save, findById } });
      const now = Date.now();

      const result = await service.revoke(auth, now);

      expect(result).toBe(reloaded);
      expect(reloaded.revokedAt).toBe(now);
      expect(findById).toHaveBeenCalledWith(auth.id);
      expect(save).toHaveBeenCalledTimes(2);
    });

    it('propagates error when max retry attempts are exhausted', async () => {
      const auth = Auth.create('user-1', 'hash-1', Date.now() + 10_000);
      auth.acknowledgePersisted();
      const conflict = new ConcurrencyConflictError('Auth', auth.id, 1, 2);
      const save = vi.fn().mockRejectedValue(conflict);
      const findById = vi.fn().mockImplementation(async () => {
        const reloaded = Auth.create('user-1', 'hash-1', Date.now() + 10_000);
        reloaded.acknowledgePersisted();
        return reloaded;
      });
      const service = createService({ authRepository: { save, findById } });

      await expect(service.revoke(auth, Date.now())).rejects.toBe(conflict);
      expect(save).toHaveBeenCalledTimes(3);
    });

    it('returns null when concurrently deleted', async () => {
      const auth = Auth.create('user-1', 'hash-1', Date.now() + 10_000);
      auth.acknowledgePersisted();
      const save = vi
        .fn()
        .mockRejectedValueOnce(
          new ConcurrencyConflictError('Auth', auth.id, 1, 2),
        );
      const findById = vi.fn().mockResolvedValue(null);
      const service = createService({ authRepository: { save, findById } });

      const result = await service.revoke(auth, Date.now());

      expect(result).toBeNull();
      expect(findById).toHaveBeenCalledWith(auth.id);
    });
  });
});
