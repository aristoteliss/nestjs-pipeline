/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { setTenantResolver } from '@cqrs-ddd/core/application';
import { currentTenantId } from '@cqrs-ddd/pipeline-tenant';
import { type EventBus, EventPublisher } from '@nestjs/cqrs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../../../users/domain/models/user.entity.js';
import { AuthCreatedEvent } from '../../../domain/events/auth-created.event.js';
import { Auth } from '../../../domain/models/auth.entity.js';
import { NodeRefreshTokens } from '../../../infrastructure/node-refresh-tokens.js';
import { CreateAuthCommand } from './create-auth.command.js';
import { CreateAuthHandler } from './create-auth.handler.js';

const TENANT = 'tenant_alpha';

beforeEach(() => setTenantResolver(() => TENANT));
afterEach(() => setTenantResolver(currentTenantId));

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
    const principalLoginService = {
      authenticate: vi.fn().mockResolvedValue(user),
      sign: vi.fn(async (_user: User, sessionId: string) => ({
        accessToken: `access-for-${sessionId}`,
        expiresAt: NOW + 300_000,
      })),
    };
    const save = vi.fn(async (auth: Auth) => auth.toJSON());
    const tokens = new NodeRefreshTokens();
    const cookies = { save: vi.fn(), clear: vi.fn() };
    const handler = new CreateAuthHandler(
      new EventPublisher({ publishAll } as unknown as EventBus),
      principalLoginService as never,
      { save },
      tokens,
      {
        refreshTokenTtlSeconds: 3600,
        refreshReuseGraceSeconds: 30,
        embedPermissions: false,
      },
      cookies,
    );
    return {
      user,
      publishAll,
      principalLoginService,
      save,
      tokens,
      cookies,
      handler,
    };
  }

  it('starts a auth storing only the refresh-token hash and signs a token for it', async () => {
    const {
      user,
      publishAll,
      principalLoginService,
      save,
      tokens,
      cookies,
      handler,
    } = setup();

    const result = await handler.execute(
      new CreateAuthCommand({
        email: 'alice@example.test',
        code: '123456',
        clientIp: '203.0.113.7',
      }),
    );

    const auth = save.mock.calls[0][0];
    expect(auth).toBeInstanceOf(Auth);
    expect(auth.userId).toBe(user.id);
    expect(auth.expiresAt).toBe(NOW + 3_600_000);
    expect(auth.refreshTokenHash).toBe(
      tokens.hash(result.refreshToken as string),
    );
    expect(JSON.stringify(save.mock.calls)).not.toContain(result.refreshToken);
    expect(principalLoginService.sign).toHaveBeenCalledWith(user, auth.id);
    expect(result).toMatchObject({
      userId: user.id,
      principalType: 'user',
      tenant: TENANT,
      email: 'alice@example.test',
      department: 'Engineering',
      accessToken: `access-for-${auth.id}`,
      accessTokenExpiresAt: NOW + 300_000,
      sessionExpiresAt: NOW + 3_600_000,
    });
    expect(cookies.save).toHaveBeenCalledExactlyOnceWith(result);
    expect(publishAll).toHaveBeenCalledExactlyOnceWith(
      [expect.any(AuthCreatedEvent)],
      auth,
      undefined,
    );
  });

  it('issues a different refresh token for every login', async () => {
    const { handler } = setup();
    const command = () =>
      new CreateAuthCommand({
        email: 'alice@example.test',
        code: '123456',
        clientIp: '203.0.113.7',
      });

    const first = await handler.execute(command());
    const second = await handler.execute(command());

    expect(first.refreshToken).not.toBe(second.refreshToken);
  });
});
