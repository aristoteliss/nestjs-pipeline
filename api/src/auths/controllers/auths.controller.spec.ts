/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { CreateAuthCommand } from '../cqrs/commands/create-auth.command';
import { DeleteAuthCommand } from '../cqrs/commands/delete-auth.command';
import { RefreshAuthCommand } from '../cqrs/commands/refresh-auth.command';
import type { CreateAuthResult } from '../cqrs/results/create-auth.result';
import { InvalidRefreshTokenError } from '../domain/errors/refresh-token.errors';
import { Auth } from '../domain/models/auth.entity';
import { AuthsController } from './auths.controller';

const USER = '019488e0-0000-7000-8000-000000000001';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  path: '/auths',
};

function result(refreshToken?: string): CreateAuthResult {
  return {
    aggregate: Auth.start(USER, 'hash', 9_000_000),
    id: USER,
    principalType: 'user',
    tenant: 'tenant_a',
    email: 'user@example.test',
    department: 'sales',
    accessToken: 'access-1',
    accessTokenExpiresAt: 300_000,
    ...(refreshToken ? { refreshToken } : {}),
    sessionExpiresAt: 9_000_000,
  };
}

function setup(execute: (command: unknown) => Promise<unknown>) {
  const commandBus = { execute: vi.fn(execute) };
  const sessionService = { saveSession: vi.fn(), clearSession: vi.fn() };
  const controller = new AuthsController(
    commandBus as never,
    sessionService as never,
  );
  const expressResponse = { cookie: vi.fn(), clearCookie: vi.fn() };
  const fastifyReply = { setCookie: vi.fn(), clearCookie: vi.fn() };
  return {
    commandBus,
    sessionService,
    controller,
    expressResponse,
    fastifyReply,
  };
}

const expectedBody = {
  id: USER,
  principalType: 'user',
  tenant: 'tenant_a',
  email: 'user@example.test',
  department: 'sales',
  accessToken: 'access-1',
  accessTokenExpiresAt: 300_000,
};

describe('AuthsController', () => {
  describe('login', () => {
    it('returns the access token and sets the refresh token only as an HttpOnly cookie', async () => {
      const { controller, commandBus, sessionService, expressResponse } = setup(
        async () => result('refresh-secret'),
      );
      const req = { session: undefined };

      const body = await controller.login(
        { email: 'user@example.test', code: '123456' },
        req,
        expressResponse,
      );

      expect(commandBus.execute).toHaveBeenCalledWith(
        expect.any(CreateAuthCommand),
      );
      expect(body).toEqual(expectedBody);
      expect(JSON.stringify(body)).not.toContain('refresh-secret');
      expect(expressResponse.cookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-secret',
        { ...COOKIE_OPTIONS, expires: new Date(9_000_000) },
      );
      expect(sessionService.saveSession).toHaveBeenCalledWith(
        undefined,
        body,
        expect.any(String),
      );
    });
  });

  describe('refresh', () => {
    it('passes the cookie and client IP and sets a rotated cookie through the Fastify reply', async () => {
      const { controller, commandBus, fastifyReply } = setup(async () =>
        result('refresh-next'),
      );

      const body = await controller.refresh(
        { cookies: { refresh_token: 'refresh-old' }, ip: '203.0.113.9' },
        fastifyReply,
      );

      const [command] = commandBus.execute.mock.calls[0] as [
        RefreshAuthCommand,
      ];
      expect(command).toBeInstanceOf(RefreshAuthCommand);
      expect(command).toMatchObject({
        refreshToken: 'refresh-old',
        clientIp: '203.0.113.9',
      });
      expect(body).toEqual(expectedBody);
      expect(fastifyReply.setCookie).toHaveBeenCalledWith(
        'refresh_token',
        'refresh-next',
        { ...COOKIE_OPTIONS, expires: new Date(9_000_000) },
      );
    });

    it('sets no cookie for a grace-window answer', async () => {
      const { controller, expressResponse } = setup(async () => result());

      await controller.refresh(
        { cookies: { refresh_token: 'refresh-previous' }, ip: '203.0.113.9' },
        expressResponse,
      );

      expect(expressResponse.cookie).not.toHaveBeenCalled();
    });

    it('rejects a request without a refresh cookie without dispatching', async () => {
      const { controller, commandBus, expressResponse } = setup(async () =>
        result(),
      );

      await expect(
        controller.refresh({ cookies: {} }, expressResponse),
      ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
      expect(commandBus.execute).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the cookie session and clears both cookies', async () => {
      const { controller, commandBus, sessionService, expressResponse } = setup(
        async () => undefined,
      );
      const session = {};

      await controller.logout(
        { cookies: { refresh_token: 'refresh-1' }, session: session as never },
        expressResponse,
      );

      const [command] = commandBus.execute.mock.calls[0] as [DeleteAuthCommand];
      expect(command).toBeInstanceOf(DeleteAuthCommand);
      expect(command.refreshToken).toBe('refresh-1');
      expect(expressResponse.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        COOKIE_OPTIONS,
      );
      expect(sessionService.clearSession).toHaveBeenCalledWith(session);
    });

    it('still clears cookies for an unknown refresh token', async () => {
      const { controller, expressResponse } = setup(async () => {
        throw new InvalidRefreshTokenError();
      });

      await expect(
        controller.logout(
          { cookies: { refresh_token: 'unknown' } },
          expressResponse,
        ),
      ).resolves.toBeUndefined();
      expect(expressResponse.clearCookie).toHaveBeenCalled();
    });

    it('propagates unexpected failures', async () => {
      const failure = new Error('database unavailable');
      const { controller, expressResponse } = setup(async () => {
        throw failure;
      });

      await expect(
        controller.logout(
          { cookies: { refresh_token: 'refresh-1' } },
          expressResponse,
        ),
      ).rejects.toBe(failure);
    });

    it('dispatches nothing without a cookie', async () => {
      const { controller, commandBus, expressResponse } = setup(
        async () => undefined,
      );

      await controller.logout({}, expressResponse);

      expect(commandBus.execute).not.toHaveBeenCalled();
      expect(expressResponse.clearCookie).toHaveBeenCalled();
    });
  });
});
