/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ITenantContext } from '@common/context/tenant-context.port';
import type { EventBus } from '@nestjs/cqrs';
import {
  type IPipelineContext,
  PipelineContext,
  SET_TENANT_ID,
} from '@nestjs-pipeline/core';
import { ConcurrencyConflictError } from '@nestjs-pipeline/ddd-core/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../../users/domain/models/user.entity';
import type { IAuthSessions } from '../../application/authentication.ports';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../../domain/errors/refresh-token.errors';
import { AuthRefreshedEvent } from '../../domain/events/auth-refreshed.event';
import { Auth, type AuthSnapshot } from '../../domain/models/auth.entity';
import { NodeRefreshTokens } from '../../infrastructure/node-refresh-tokens';
import { DeleteAuthCommand } from './delete-auth.command';
import { DeleteAuthHandler } from './delete-auth.handler';
import { RefreshAuthCommand } from './refresh-auth.command';
import {
  RefreshAuthHandler,
  refreshAuthRateLimitKey,
} from './refresh-auth.handler';

const T0 = Date.UTC(2026, 8, 22, 12, 0, 0);
const GRACE_SECONDS = 30;
const tokens = new NodeRefreshTokens();

/**
 * Primary storage for sessions: lookups return fresh aggregates, and saves are
 * version-conditioned like `optimisticUpdate`.
 */
class SessionStore implements IAuthSessions {
  readonly rows = new Map<string, AuthSnapshot>();
  readonly consumed = new Map<string, string>();

  private load(snapshot: AuthSnapshot | undefined): Auth | null {
    return snapshot ? Auth.fromJSON(snapshot) : null;
  }

  async findByTokenHash(hash: string): Promise<Auth | null> {
    return this.load(
      [...this.rows.values()].find(
        (row) =>
          row.refreshTokenHash === hash ||
          row.previousRefreshTokenHash === hash,
      ),
    );
  }

  async findByConsumedTokenHash(hash: string): Promise<Auth | null> {
    const authId = this.consumed.get(hash);
    return authId ? this.load(this.rows.get(authId)) : null;
  }

  async recordConsumed(hash: string, authId: string): Promise<void> {
    if (!this.consumed.has(hash)) this.consumed.set(hash, authId);
  }

  readonly repository = {
    findById: async (id: string) => this.load(this.rows.get(id)),
    save: vi.fn(async (auth: Auth) => {
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
    const auth = Auth.start(USER.id, tokens.hash(token), expiresAt);
    this.rows.set(auth.id, auth.toJSON());
    return auth;
  }

  current(id: string): AuthSnapshot {
    const row = this.rows.get(id);
    if (!row) throw new Error('missing session');
    return row;
  }
}

const USER = User.create('alice', 'alice@example.test', 'engineering');

function setup() {
  const store = new SessionStore();
  const publishAll = vi.fn();
  const signToken = vi.fn(async (_user: User, sessionId: string) => ({
    userId: USER.id,
    accessToken: `access-for-${sessionId}`,
    expiresAt: Date.now() + 300_000,
  }));
  const handler = new RefreshAuthHandler(
    { publishAll } as unknown as EventBus,
    store,
    store.repository as never,
    { find: vi.fn().mockResolvedValue(USER) },
    tokens,
    {
      refreshTokenTtlSeconds: 3600,
      refreshReuseGraceSeconds: GRACE_SECONDS,
      permissionsInAccessToken: false,
    },
    { signToken } as never,
    { schema: 'tenant' } as ITenantContext,
  );
  const refresh = (refreshToken: string) =>
    handler.execute(
      new RefreshAuthCommand({ refreshToken, clientIp: '203.0.113.7' }),
    );
  return { store, handler, refresh, publishAll, signToken };
}

describe('RefreshAuthHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rotates, honours the grace window, detects reuse and ends the session', async () => {
    const { store, refresh } = setup();
    const session = store.start('token-a');

    const first = await refresh('token-a');
    const tokenB = first.refreshToken as string;
    expect(tokenB).toBeDefined();
    expect(first.accessToken).toBe(`access-for-${session.id}`);
    expect(store.current(session.id).refreshTokenHash).toBe(
      tokens.hash(tokenB),
    );

    vi.setSystemTime(T0 + 10_000);
    const grace = await refresh('token-a');
    expect(grace.refreshToken).toBeUndefined();
    expect(grace.accessToken).toBe(`access-for-${session.id}`);
    expect(store.current(session.id).refreshTokenHash).toBe(
      tokens.hash(tokenB),
    );

    const second = await refresh(tokenB);
    const tokenC = second.refreshToken as string;
    expect(tokenC).toBeDefined();

    vi.setSystemTime(T0 + 10_000 + GRACE_SECONDS * 1000 + 1);
    await expect(refresh('token-a')).rejects.toBeInstanceOf(
      RefreshTokenReuseError,
    );
    expect(store.current(session.id).revokedAt).toBe(Date.now());
    await expect(refresh(tokenC)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('revokes the session when an older generation is presented', async () => {
    const { store, refresh } = setup();
    const session = store.start('token-a');
    const tokenB = (await refresh('token-a')).refreshToken as string;
    const tokenC = (await refresh(tokenB)).refreshToken as string;

    await expect(refresh('token-a')).rejects.toBeInstanceOf(
      RefreshTokenReuseError,
    );
    expect(store.current(session.id).revokedAt).not.toBeNull();
    await expect(refresh(tokenC)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });

  it('answers grace without a new cookie after losing the rotation race', async () => {
    const { store, refresh } = setup();
    const session = store.start('token-a');
    const save = store.repository.save.getMockImplementation();
    store.repository.save.mockImplementationOnce(async (auth: Auth) => {
      // A concurrent request rotates first and commits.
      const winner = Auth.fromJSON(store.current(session.id));
      winner.refresh(tokens.hash('token-a'), tokens.hash('winner'), T0, 0);
      await save?.(winner);
      return save?.(auth) as never;
    });

    const result = await refresh('token-a');

    expect(result.refreshToken).toBeUndefined();
    expect(result.accessToken).toBe(`access-for-${session.id}`);
    expect(store.current(session.id).refreshTokenHash).toBe(
      tokens.hash('winner'),
    );
  });

  it('keeps a session current when its history row was written but its save failed', async () => {
    const { store, refresh } = setup();
    const session = store.start('token-a');
    store.repository.save.mockRejectedValueOnce(new Error('connection lost'));

    await expect(refresh('token-a')).rejects.toThrow('connection lost');
    expect(store.consumed.get(tokens.hash('token-a'))).toBe(session.id);

    const retry = await refresh('token-a');
    expect(retry.refreshToken).toBeDefined();
    expect(store.current(session.id).revokedAt).toBeNull();
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
    expect(publishAll).toHaveBeenCalledExactlyOnceWith([
      expect.any(AuthRefreshedEvent),
    ]);
    publishAll.mockClear();

    await refresh('token-a');
    expect(publishAll).not.toHaveBeenCalled();
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

  it('keys the refresh rate limit on tenant and client IP, never the token', () => {
    const context = new PipelineContext(
      new RefreshAuthCommand({
        refreshToken: 'secret-token',
        clientIp: '203.0.113.7',
      }),
      {
        handlerType: RefreshAuthHandler,
        handlerName: 'RefreshAuthHandler',
        requestKind: 'command',
      },
    );
    context[SET_TENANT_ID]('tenant_a');

    const key = refreshAuthRateLimitKey(context as IPipelineContext);

    expect(key).toContain('tenant_a');
    expect(key).toContain('203.0.113.7');
    expect(key).not.toContain('secret-token');
  });
});

describe('DeleteAuthHandler', () => {
  it('revokes the session that owns the refresh token', async () => {
    const store = new SessionStore();
    const session = store.start('token-a');
    const handler = new DeleteAuthHandler(
      { publishAll: vi.fn() } as unknown as EventBus,
      store,
      store.repository as never,
      tokens,
    );

    await handler.execute(new DeleteAuthCommand({ refreshToken: 'token-a' }));

    expect(store.current(session.id).revokedAt).not.toBeNull();
  });

  it('rejects an unknown refresh token', async () => {
    const store = new SessionStore();
    const handler = new DeleteAuthHandler(
      { publishAll: vi.fn() } as unknown as EventBus,
      store,
      store.repository as never,
      tokens,
    );

    await expect(
      handler.execute(new DeleteAuthCommand({ refreshToken: 'unknown' })),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    expect(store.repository.save).not.toHaveBeenCalled();
  });
});
