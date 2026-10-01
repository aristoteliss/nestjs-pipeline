/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IQueryRepository } from '@cqrs-ddd/core/application';
import { setTenantResolver } from '@cqrs-ddd/core/application';
import { ConcurrencyConflictError } from '@cqrs-ddd/core/domain';
import type { EventBus } from '@nestjs/cqrs';
import { currentTenantId } from '@nestjs-pipeline/tenant';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../../../users/domain/models/user.entity';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../../../domain/errors/refresh-token.errors';
import { AuthRefreshedEvent } from '../../../domain/events/auth-refreshed.event';
import { AuthRevokedEvent } from '../../../domain/events/auth-revoked.event';
import { Auth, type AuthSnapshot } from '../../../domain/models/auth.entity';
import { NodeRefreshTokens } from '../../../infrastructure/node-refresh-tokens';
import { PrincipalLoginService } from '../../../services/principal-login.service';
import { GetAuthByConsumedTokenHashQuery } from '../queries/get-auth-by-consumed-token-hash.query';
import { GetAuthByTokenHashQuery } from '../queries/get-auth-by-token-hash.query';
import { RevokeAuthCommand } from './revoke-auth.command';
import { RevokeAuthHandler } from './revoke-auth.handler';

const TENANT = 'tenant';

beforeEach(() => setTenantResolver(() => TENANT));
afterEach(() => setTenantResolver(currentTenantId));

const T0 = Date.UTC(2026, 8, 22, 12, 0, 0);
const GRACE_SECONDS = 30;
const tokens = new NodeRefreshTokens();

/**
 * Primary storage for sessions: lookups return fresh aggregates, and saves are
 * version-conditioned like `optimisticUpdate`.
 */
class SessionStore {
  readonly rows = new Map<string, AuthSnapshot>();
  readonly consumed = new Map<string, string>();

  private load(snapshot: AuthSnapshot | undefined): Auth | null {
    return snapshot ? Auth.fromJSON(snapshot) : null;
  }

  readonly byTokenHash: IQueryRepository<GetAuthByTokenHashQuery, Auth | null> =
    {
      find: async (query: GetAuthByTokenHashQuery) => {
        return this.load(
          [...this.rows.values()].find(
            (row) =>
              row.refreshTokenHash === query.tokenHash ||
              row.previousRefreshTokenHash === query.tokenHash,
          ),
        );
      },
    };

  readonly byConsumedTokenHash: IQueryRepository<
    GetAuthByConsumedTokenHashQuery,
    Auth | null
  > = {
    find: async (query: GetAuthByConsumedTokenHashQuery) => {
      const authId = this.consumed.get(query.tokenHash);
      return authId ? this.load(this.rows.get(authId)) : null;
    },
  };

  recordConsumed(hash: string, authId: string): void {
    if (!this.consumed.has(hash)) this.consumed.set(hash, authId);
  }

  readonly repository = {
    findById: async (id: string) => this.load(this.rows.get(id)),
    save: vi.fn(async (auth: Auth) => {
      const consumed = auth.getConsumedToken();
      if (consumed) this.recordConsumed(consumed.tokenHash, auth.id);
      const stored = this.rows.get(auth.id);
      if (stored && stored.version !== auth.getExpectedVersion()) {
        throw new ConcurrencyConflictError(
          'Auth',
          auth.id,
          auth.getExpectedVersion(),
          stored.version,
        );
      }
      this.rows.set(auth.id, auth.toJSON());
      auth.acknowledgePersisted();
      return auth.toJSON();
    }),
  };

  start(token: string, expiresAt = T0 + 3_600_000): Auth {
    const auth = Auth.create(USER.id, tokens.hash(token), expiresAt);
    this.rows.set(auth.id, auth.toJSON());
    return auth;
  }

  current(id: string): AuthSnapshot {
    const row = this.rows.get(id);
    if (!row) throw new Error('missing auth');
    return row;
  }
}

const USER = User.create('alice', 'alice@example.test', 'engineering');

function setup() {
  const store = new SessionStore();
  const publishAll = vi.fn();
  const cookies = { save: vi.fn(), clear: vi.fn() };
  const service = new PrincipalLoginService(
    { find: vi.fn().mockResolvedValue(USER) } as never,
    { verify: vi.fn() } as never,
    {
      issue: vi.fn(async ({ sessionId }: { sessionId: string }) => ({
        accessToken: `access-for-${sessionId}`,
        expiresAt: Date.now() + 300_000,
      })),
    } as never,
    {
      refreshTokenTtlSeconds: 3600,
      refreshReuseGraceSeconds: GRACE_SECONDS,
      embedPermissions: false,
    },
    { find: vi.fn() } as never,
    store.byTokenHash,
    store.byConsumedTokenHash,
    store.repository as never,
    tokens,
    cookies,
    { publishAll } as unknown as EventBus,
  );
  const sign = vi.spyOn(service, 'sign');
  const refresh = (refreshToken: string) =>
    service.refresh(refreshToken, '203.0.113.7');
  return { store, service, refresh, publishAll, sign, cookies };
}

function logoutHandler(store: SessionStore, publishAll = vi.fn()) {
  const cookies = { save: vi.fn(), clear: vi.fn() };
  const service = new PrincipalLoginService(
    { find: vi.fn().mockResolvedValue(USER) } as never,
    { verify: vi.fn() } as never,
    {
      issue: vi.fn(),
    } as never,
    {
      refreshTokenTtlSeconds: 3600,
      refreshReuseGraceSeconds: GRACE_SECONDS,
      embedPermissions: false,
    },
    { find: vi.fn() } as never,
    store.byTokenHash,
    store.byConsumedTokenHash,
    store.repository as never,
    tokens,
    cookies,
    { publishAll } as unknown as EventBus,
  );
  const handler = new RevokeAuthHandler(
    { publishAll } as unknown as EventBus,
    store.byTokenHash,
    tokens,
    cookies,
    service,
  );
  return { handler, cookies };
}

describe('PrincipalLoginService refresh', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists revocation of the immediately previous token outside grace before token issuance', async () => {
    const { store, refresh, sign } = setup();
    const auth = store.start('token-a');
    const current = (await refresh('token-a')).refreshToken as string;
    sign.mockRejectedValue(new Error('issuer unavailable'));
    vi.setSystemTime(T0 + 31_000);
    await expect(refresh('token-a')).rejects.toBeInstanceOf(
      RefreshTokenReuseError,
    );
    expect(store.current(auth.id).revokedAt).toBe(Date.now());
    await expect(refresh(current)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('revokes reuse when two rotations move the presented token into history during a conflict', async () => {
    const { store, refresh } = setup();
    const auth = store.start('token-a');
    const save = store.repository.save.getMockImplementation()!;
    store.repository.save.mockImplementationOnce(async (stale) => {
      for (const [from, to] of [
        ['token-a', 'token-b'],
        ['token-b', 'token-c'],
      ]) {
        const winner = Auth.fromJSON(store.current(auth.id));
        winner.refresh(tokens.hash(from), tokens.hash(to), Date.now(), 30_000);
        await save(winner);
      }
      return save(stale);
    });
    await expect(refresh('token-a')).rejects.toBeInstanceOf(
      RefreshTokenReuseError,
    );
    expect(store.current(auth.id).revokedAt).not.toBeNull();
    await expect(refresh('token-c')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('reports exhausted historical revocation conflicts instead of claiming reuse was handled', async () => {
    const { store, refresh } = setup();
    const auth = store.start('token-a');
    const tokenB = (await refresh('token-a')).refreshToken as string;
    await refresh(tokenB);
    const conflict = new ConcurrencyConflictError('Auth', auth.id, 1, 2);
    store.repository.save.mockRejectedValue(conflict);
    await expect(refresh('token-a')).rejects.toBe(conflict);
  });

  it('does not rotate a session that expires during access-token preparation', async () => {
    const { store, refresh, sign } = setup();
    const auth = store.start('token-a', T0 + 1000);
    sign.mockImplementationOnce(async () => {
      vi.setSystemTime(T0 + 2000);
      return {
        accessToken: 'prepared',
        expiresAt: T0 + 300_000,
      };
    });
    await expect(refresh('token-a')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    expect(store.current(auth.id).refreshTokenHash).toBe(
      tokens.hash('token-a'),
    );
  });

  it('rotates, honours the grace window, detects reuse and ends the session', async () => {
    const { store, refresh } = setup();
    const auth = store.start('token-a');

    const first = await refresh('token-a');
    const tokenB = first.refreshToken as string;
    expect(tokenB).toBeDefined();
    expect(first.accessToken).toBe(`access-for-${auth.id}`);
    expect(store.current(auth.id).refreshTokenHash).toBe(tokens.hash(tokenB));

    vi.setSystemTime(T0 + 10_000);
    const grace = await refresh('token-a');
    expect(grace.refreshToken).toBeUndefined();
    expect(grace.accessToken).toBe(`access-for-${auth.id}`);
    expect(store.current(auth.id).refreshTokenHash).toBe(tokens.hash(tokenB));

    const second = await refresh(tokenB);
    const tokenC = second.refreshToken as string;
    expect(tokenC).toBeDefined();

    vi.setSystemTime(T0 + 10_000 + GRACE_SECONDS * 1000 + 1);
    await expect(refresh('token-a')).rejects.toBeInstanceOf(
      RefreshTokenReuseError,
    );
    expect(store.current(auth.id).revokedAt).toBe(Date.now());
    await expect(refresh(tokenC)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('revokes the session when an older generation is presented', async () => {
    const { store, refresh } = setup();
    const auth = store.start('token-a');
    const tokenB = (await refresh('token-a')).refreshToken as string;
    const tokenC = (await refresh(tokenB)).refreshToken as string;

    await expect(refresh('token-a')).rejects.toBeInstanceOf(
      RefreshTokenReuseError,
    );
    expect(store.current(auth.id).revokedAt).not.toBeNull();
    await expect(refresh(tokenC)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('answers grace without a new cookie after losing the rotation race', async () => {
    const { store, refresh } = setup();
    const auth = store.start('token-a');
    const save = store.repository.save.getMockImplementation();
    store.repository.save.mockImplementationOnce(async (auth: Auth) => {
      // A concurrent request rotates first and commits.
      const winner = Auth.fromJSON(store.current(auth.id));
      winner.refresh(tokens.hash('token-a'), tokens.hash('winner'), T0, 0);
      await save?.(winner);
      return save?.(auth) as never;
    });

    const result = await refresh('token-a');

    expect(result.refreshToken).toBeUndefined();
    expect(result.accessToken).toBe(`access-for-${auth.id}`);
    expect(store.current(auth.id).refreshTokenHash).toBe(tokens.hash('winner'));
  });

  it('keeps a session current when its history row was written but its save failed', async () => {
    const { store, refresh } = setup();
    const auth = store.start('token-a');
    store.recordConsumed(tokens.hash('token-a'), auth.id);
    store.repository.save.mockRejectedValueOnce(new Error('connection lost'));

    await expect(refresh('token-a')).rejects.toThrow('connection lost');
    expect(store.consumed.get(tokens.hash('token-a'))).toBe(auth.id);

    const retry = await refresh('token-a');
    expect(retry.refreshToken).toBeDefined();
    expect(store.current(auth.id).revokedAt).toBeNull();
  });

  it('writes the session cookies of a successful refresh', async () => {
    const { store, refresh, cookies } = setup();
    store.start('token-a');

    const result = await refresh('token-a');

    expect(cookies.save).toHaveBeenCalledExactlyOnceWith(result);
  });

  it('rejects an expired session and an unknown token', async () => {
    const { store, refresh } = setup();
    store.start('token-a', T0 + 1000);

    vi.setSystemTime(T0 + 1000);
    await expect(refresh('token-a')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
    await expect(refresh('never-issued')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('publishes the rotation event and nothing on a grace answer', async () => {
    const { store, refresh, publishAll } = setup();
    store.start('token-a');

    await refresh('token-a');
    expect(publishAll).toHaveBeenCalledExactlyOnceWith(
      [expect.any(AuthRefreshedEvent)],
      expect.any(Auth),
    );
    publishAll.mockClear();

    await refresh('token-a');
    expect(publishAll).not.toHaveBeenCalled();
  });

  it("rejects the refresh with an asynchronous publisher's error, after handing over the events", async () => {
    const { store, refresh, publishAll } = setup();
    const auth = store.start('token-a');
    const failure = new Error('broker unavailable');
    publishAll.mockReturnValueOnce(Promise.reject(failure));

    await expect(refresh('token-a')).rejects.toBe(failure);
    expect(publishAll).toHaveBeenCalledExactlyOnceWith(
      [expect.any(AuthRefreshedEvent)],
      expect.any(Auth),
    );
    expect(store.current(auth.id).revokedAt).toBeNull();
  });

  it('never hands the raw refresh token to persistence', async () => {
    const { store, refresh } = setup();
    store.start('token-a');

    const { refreshToken } = await refresh('token-a');

    const persisted = JSON.stringify([
      ...store.rows.values(),
      ...store.consumed.keys(),
    ]);
    expect(persisted).not.toContain('token-a');
    expect(persisted).not.toContain(refreshToken as string);
  });

  it('retries revocation when historical token reuse loses a version race to a concurrent rotation', async () => {
    const { store, refresh } = setup();
    const auth = store.start('token-a');

    const resB = await refresh('token-a');
    const tokenB = resB.refreshToken as string;

    const resC = await refresh(tokenB);
    const tokenC = resC.refreshToken as string;

    const originalSave = store.repository.save.getMockImplementation();
    let conflictInjected = false;
    store.repository.save.mockImplementation(async (auth: Auth) => {
      if (!conflictInjected && auth.revokedAt !== null) {
        conflictInjected = true;
        const current = store.current(auth.id);
        const concurrent = Auth.fromJSON(current);
        concurrent.refresh(
          tokens.hash(tokenC),
          tokens.hash('token-d'),
          Date.now(),
          30_000,
        );
        store.rows.set(concurrent.id, concurrent.toJSON());
        throw new ConcurrencyConflictError(
          'Auth',
          auth.id,
          auth.getExpectedVersion(),
          concurrent.version,
        );
      }
      return originalSave!(auth);
    });

    await expect(refresh('token-a')).rejects.toBeInstanceOf(
      RefreshTokenReuseError,
    );

    expect(store.current(auth.id).revokedAt).not.toBeNull();
    await expect(refresh('token-d')).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('leaves the auth unrotated when token signing fails, allowing clean retry', async () => {
    const { store, refresh, sign } = setup();
    const auth = store.start('token-a');

    sign.mockRejectedValueOnce(new Error('transient token issuance failure'));

    await expect(refresh('token-a')).rejects.toThrow(
      'transient token issuance failure',
    );

    expect(store.current(auth.id).refreshTokenHash).toBe(
      tokens.hash('token-a'),
    );
    expect(store.consumed.has(tokens.hash('token-a'))).toBe(false);

    const result = await refresh('token-a');
    expect(result.refreshToken).toBeDefined();
    expect(result.accessToken).toBe(`access-for-${auth.id}`);
    expect(store.current(auth.id).refreshTokenHash).toBe(
      tokens.hash(result.refreshToken as string),
    );
    expect(store.consumed.get(tokens.hash('token-a'))).toBe(auth.id);
  });
});

describe('RevokeAuthHandler', () => {
  it('revokes the auth that owns the refresh token', async () => {
    const store = new SessionStore();
    const auth = store.start('token-a');
    const publishAll = vi.fn();
    const { handler, cookies } = logoutHandler(store, publishAll);

    await handler.execute(
      new RevokeAuthCommand({
        refreshToken: 'token-a',
        clientIp: '203.0.113.7',
      }),
    );

    expect(store.current(auth.id).revokedAt).not.toBeNull();
    expect(publishAll).toHaveBeenCalledExactlyOnceWith(
      [expect.any(AuthRevokedEvent)],
      expect.objectContaining({ id: auth.id }),
    );
    expect(cookies.clear).toHaveBeenCalledOnce();
  });

  it('retries revocation when logout encounters a concurrency conflict', async () => {
    const store = new SessionStore();
    const auth = store.start('token-a', Date.now() + 3_600_000);
    let conflictInjected = false;
    const originalSave = store.repository.save.getMockImplementation();
    store.repository.save.mockImplementation(async (auth: Auth) => {
      if (!conflictInjected) {
        conflictInjected = true;
        const current = store.current(auth.id);
        const concurrent = Auth.fromJSON(current);
        concurrent.refresh(
          tokens.hash('token-a'),
          tokens.hash('token-b'),
          Date.now(),
          30_000,
        );
        store.rows.set(concurrent.id, concurrent.toJSON());
        throw new ConcurrencyConflictError(
          'Auth',
          auth.id,
          auth.getExpectedVersion(),
          concurrent.version,
        );
      }
      return originalSave!(auth);
    });

    const { handler } = logoutHandler(store);

    const revoked = await handler.execute(
      new RevokeAuthCommand({
        refreshToken: 'token-a',
        clientIp: '203.0.113.7',
      }),
    );
    expect(revoked.revokedAt).not.toBeNull();
    expect(store.current(auth.id).revokedAt).not.toBeNull();
  });

  it('does not report logout success after exhausting revocation conflicts', async () => {
    const store = new SessionStore();
    const auth = store.start('token-a');
    const conflict = new ConcurrencyConflictError('Auth', auth.id, 1, 2);
    store.repository.save.mockRejectedValue(conflict);
    const { handler, cookies } = logoutHandler(store);

    await expect(
      handler.execute(
        new RevokeAuthCommand({
          refreshToken: 'token-a',
          clientIp: '203.0.113.7',
        }),
      ),
    ).rejects.toBe(conflict);
    expect(cookies.clear).not.toHaveBeenCalled();
  });

  it('clears the cookies and rejects an unknown refresh token', async () => {
    const store = new SessionStore();
    const { handler, cookies } = logoutHandler(store);

    await expect(
      handler.execute(
        new RevokeAuthCommand({
          refreshToken: 'unknown',
          clientIp: '203.0.113.7',
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    expect(store.repository.save).not.toHaveBeenCalled();
    expect(cookies.clear).toHaveBeenCalledOnce();
  });

  it('clears the cookies and rejects a logout without a refresh token', async () => {
    const store = new SessionStore();
    const { handler, cookies } = logoutHandler(store);

    await expect(
      handler.execute(new RevokeAuthCommand({ clientIp: '203.0.113.7' })),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    expect(cookies.clear).toHaveBeenCalledOnce();
  });
});
