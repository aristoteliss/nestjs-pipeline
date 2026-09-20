/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ITenantContext } from '@common/context/tenant-context.port';
import type { EventBus } from '@nestjs/cqrs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../../users/domain/models/user.entity';
import { CreatedAuthEvent } from '../../domain/events/create-auth.event';
import { Auth } from '../../domain/models/auth.entity';
import { NodeRefreshTokens } from '../../infrastructure/node-refresh-tokens';
import { CreateAuthCommand } from './create-auth.command';
import { CreateAuthHandler } from './create-auth.handler';

const NOW = Date.UTC(2026, 8, 22);

describe('CreateAuthHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const user = User.create('alice', 'alice@example.test', 'Engineering');
    const publishAll = vi.fn();
    const userLoginService = {
      authenticate: vi.fn().mockResolvedValue(user),
      signToken: vi.fn(async (_user: User, sessionId: string) => ({
        userId: user.id,
        accessToken: `access-for-${sessionId}`,
        expiresAt: NOW + 300_000,
      })),
    };
    const save = vi.fn(async (auth: Auth) => auth.toJSON());
    const tokens = new NodeRefreshTokens();
    const handler = new CreateAuthHandler(
      { publishAll } as unknown as EventBus,
      userLoginService as never,
      { save },
      { schema: 'tenant_alpha' } as ITenantContext,
      tokens,
      {
        refreshTokenTtlSeconds: 3600,
        refreshReuseGraceSeconds: 30,
        permissionsInAccessToken: false,
      },
    );
    return { user, publishAll, userLoginService, save, tokens, handler };
  }

  it('starts a session storing only the refresh-token hash and signs a token for it', async () => {
    const { user, publishAll, userLoginService, save, tokens, handler } =
      setup();

    const result = await handler.execute(
      new CreateAuthCommand({ email: 'alice@example.test', code: '123456' }),
    );

    const session = save.mock.calls[0][0];
    expect(session).toBeInstanceOf(Auth);
    expect(session.userId).toBe(user.id);
    expect(session.expiresAt).toBe(NOW + 3_600_000);
    expect(session.refreshTokenHash).toBe(
      tokens.hash(result.refreshToken as string),
    );
    expect(JSON.stringify(save.mock.calls)).not.toContain(result.refreshToken);
    expect(userLoginService.signToken).toHaveBeenCalledWith(user, session.id);
    expect(result).toMatchObject({
      id: user.id,
      principalType: 'user',
      tenant: 'tenant_alpha',
      email: 'alice@example.test',
      department: 'Engineering',
      accessToken: `access-for-${session.id}`,
      accessTokenExpiresAt: NOW + 300_000,
      sessionExpiresAt: NOW + 3_600_000,
    });
    expect(publishAll).toHaveBeenCalledExactlyOnceWith([
      expect.any(CreatedAuthEvent),
    ]);
  });

  it('issues a different refresh token for every login', async () => {
    const { handler } = setup();
    const command = () =>
      new CreateAuthCommand({ email: 'alice@example.test', code: '123456' });

    const first = await handler.execute(command());
    const second = await handler.execute(command());

    expect(first.refreshToken).not.toBe(second.refreshToken);
  });
});
