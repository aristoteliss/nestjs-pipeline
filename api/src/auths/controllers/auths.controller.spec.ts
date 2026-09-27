/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { CreateAuthCommand } from '../application/cqrs/commands/create-auth.command';
import { RevokeAuthCommand } from '../application/cqrs/commands/revoke-auth.command';
import type { AuthResult } from '../application/results/auth.result';
import { InvalidRefreshTokenError } from '../domain/errors/refresh-token.errors';
import { Auth } from '../domain/models/auth.entity';
import { AuthsController } from './auths.controller';

const USER = '019488e0-0000-7000-8000-000000000001';
const CLIENT_IP = '203.0.113.9';

const issued: AuthResult = {
  aggregate: Auth.create(USER, 'hash', 9_000_000),
  userId: USER,
  principalType: 'user',
  tenant: 'tenant_a',
  email: 'user@example.test',
  department: 'sales',
  accessToken: 'access-1',
  accessTokenExpiresAt: 300_000,
  refreshToken: 'refresh-secret',
  sessionExpiresAt: 9_000_000,
};

const expectedBody = {
  id: USER,
  principalType: 'user',
  tenant: 'tenant_a',
  email: 'user@example.test',
  department: 'sales',
  accessToken: 'access-1',
  accessTokenExpiresAt: 300_000,
};

function setup(
  execute: (command: unknown) => Promise<unknown>,
  refresh: (
    refreshToken: string,
    clientIp: string,
  ) => Promise<unknown> = async () => issued,
) {
  const commandBus = { execute: vi.fn(execute) };
  const principalLoginService = { refresh: vi.fn(refresh) };
  const controller = new AuthsController(
    commandBus as never,
    principalLoginService as never,
  );
  return { commandBus, principalLoginService, controller };
}

describe('AuthsController', () => {
  it('dispatches the login with the client address and answers without the refresh token', async () => {
    const { controller, commandBus } = setup(async () => issued);

    const body = await controller.login(
      { email: 'user@example.test', code: '123456' },
      CLIENT_IP,
    );

    const [command] = commandBus.execute.mock.calls[0] as [CreateAuthCommand];
    expect(command).toBeInstanceOf(CreateAuthCommand);
    expect(command).toMatchObject({
      email: 'user@example.test',
      clientIp: CLIENT_IP,
    });
    expect(body).toEqual(expectedBody);
    expect(JSON.stringify(body)).not.toContain('refresh-secret');
  });

  it('calls principal login service with the refresh token and client address and maps the result', async () => {
    const { controller, principalLoginService } = setup(
      async () => undefined,
      async () => issued,
    );

    const body = await controller.refresh('refresh-old', CLIENT_IP);

    expect(principalLoginService.refresh).toHaveBeenCalledWith(
      'refresh-old',
      CLIENT_IP,
    );
    expect(body).toEqual(expectedBody);
  });

  it('dispatches the logout with the refresh token and the client address', async () => {
    const { controller, commandBus } = setup(async () => undefined);

    await controller.logout('refresh-1', CLIENT_IP);

    const [command] = commandBus.execute.mock.calls[0] as [RevokeAuthCommand];
    expect(command).toBeInstanceOf(RevokeAuthCommand);
    expect(command).toMatchObject({
      refreshToken: 'refresh-1',
      clientIp: CLIENT_IP,
    });
  });

  it('answers a logout with a missing or unknown refresh token without an error', async () => {
    const { controller, commandBus } = setup(async () => {
      throw new InvalidRefreshTokenError();
    });

    await expect(
      controller.logout(undefined, CLIENT_IP),
    ).resolves.toBeUndefined();
    await expect(
      controller.logout('unknown', CLIENT_IP),
    ).resolves.toBeUndefined();
    expect(commandBus.execute).toHaveBeenCalledTimes(2);
  });

  it('propagates any other logout failure', async () => {
    const failure = new Error('database unavailable');
    const { controller } = setup(async () => {
      throw failure;
    });

    await expect(controller.logout('refresh-1', CLIENT_IP)).rejects.toBe(
      failure,
    );
  });
});
