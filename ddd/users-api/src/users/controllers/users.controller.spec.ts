/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { NotFoundException } from '@nestjs/common';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  type AppAbility,
  buildAbility,
  CaslAuthorizer,
} from '@nestjs-pipeline/casl';
import { describe, expect, it, vi } from 'vitest';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';
import { DeleteUserCommand } from '../cqrs/commands/delete-user.command';
import { GetUserHandler } from '../cqrs/queries/get-user.handler';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { GetUserOverviewQuery } from '../cqrs/queries/get-user-overview.query';
import { GetUsersQuery } from '../cqrs/queries/get-users.query';
import { User } from '../domain/models/user.entity';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  function readingBus(ability: AppAbility, user: User): QueryBus {
    const handler = new GetUserHandler(
      { find: vi.fn().mockResolvedValue(user) },
      new CaslAuthorizer(ability),
    );
    return {
      execute: vi.fn((query: GetUserQuery) => handler.execute(query)),
    } as unknown as QueryBus;
  }

  function writingBus(result: unknown): CommandBus {
    return {
      execute: vi.fn().mockResolvedValue(result),
    } as unknown as CommandBus;
  }

  it('creates a user and answers with a fresh authorized read', async () => {
    const user = User.create('Alice', 'alice@example.test', 'Engineering');
    const commandBus = writingBus(user);
    const queryBus = readingBus(
      buildAbility(['User|create|*', 'User|read|*']),
      user,
    );

    const result = await new UsersController(commandBus, queryBus).createUser({
      name: 'Alice',
      email: 'alice@example.test',
      department: 'Engineering',
    });

    expect(commandBus.execute).toHaveBeenCalledOnce();
    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.any(CreateUserCommand),
    );
    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetUserQuery));
    expect(result).toEqual({
      id: user.id,
      name: 'Alice',
      email: 'alice@example.test',
      department: 'Engineering',
    });
  });

  it('answers an update with only the fields the caller may read', async () => {
    const user = User.create('Alice', 'alice@example.test', 'Engineering');
    user.update({ username: 'Alicia' });
    const queryBus = readingBus(
      buildAbility(['User|update|*|username', 'User|read|*|username']),
      user,
    );

    const result = await new UsersController(
      writingBus(user),
      queryBus,
    ).updateUser(user.id, { name: 'Alicia' });

    expect(result).toEqual({ name: 'Alicia' });
    const [query] = vi.mocked(queryBus.execute).mock.calls[0] as unknown as [
      GetUserQuery,
    ];
    expect(query.userId).toBe(user.id);
  });

  it.each([
    [
      'create',
      (c: UsersController, _id: string) =>
        c.createUser({ name: 'Alice', email: 'alice@example.test' }),
    ],
    [
      'update',
      (c: UsersController, id: string) => c.updateUser(id, { name: 'Alicia' }),
    ],
  ])(
    'answers a write-only caller with an empty body (%s)',
    async (_, write) => {
      const user = User.create('Alice', 'alice@example.test');
      const commandBus = writingBus(user);
      const controller = new UsersController(
        commandBus,
        readingBus(buildAbility(['User|create|*', 'User|update|*']), user),
      );

      await expect(write(controller, user.id)).resolves.toEqual({});
      expect(commandBus.execute).toHaveBeenCalledOnce();
    },
  );

  it('answers with an empty body when the written user can no longer be read', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const queryBus = {
      execute: vi.fn().mockResolvedValue(null),
    } as unknown as QueryBus;

    await expect(
      new UsersController(writingBus(user), queryBus).updateUser(user.id, {
        name: 'Alicia',
      }),
    ).resolves.toEqual({});
  });

  it('propagates an unexpected read failure after the write', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const failure = new Error('read replica unavailable');
    const queryBus = {
      execute: vi.fn().mockRejectedValue(failure),
    } as unknown as QueryBus;

    await expect(
      new UsersController(writingBus(user), queryBus).createUser({
        name: 'Alice',
        email: 'alice@example.test',
      }),
    ).rejects.toBe(failure);
  });

  it('reads the id of an idempotently replayed create result', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const replayed = JSON.parse(JSON.stringify(user.toJSON()));
    const queryBus = readingBus(buildAbility(['User|read|*']), user);

    const result = await new UsersController(
      writingBus(replayed),
      queryBus,
    ).createUser({ name: 'Alice', email: 'alice@example.test' });

    const [query] = vi.mocked(queryBus.execute).mock.calls[0] as unknown as [
      GetUserQuery,
    ];
    expect(query.userId).toBe(user.id);
    expect(result.id).toBe(user.id);
  });

  it('deletes user via DeleteUserCommand', async () => {
    const commandBus = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as CommandBus;
    const queryBus = { execute: vi.fn() } as unknown as QueryBus;

    const controller = new UsersController(commandBus, queryBus);
    await controller.deleteUser('019488e0-0000-7000-8000-000000000001');

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.any(DeleteUserCommand),
    );
  });

  it('fetches user list via GetUsersQuery', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const commandBus = { execute: vi.fn() } as unknown as CommandBus;
    const queryBus = {
      execute: vi.fn().mockResolvedValue([user.toJSON()]),
    } as unknown as QueryBus;

    const controller = new UsersController(commandBus, queryBus);
    const result = await controller.getUsers();

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetUsersQuery));
    expect(result.users).toHaveLength(1);
    expect(result.users[0].email).toBe('alice@example.test');
  });

  it('fetches single user via GetUserQuery', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const commandBus = { execute: vi.fn() } as unknown as CommandBus;
    const queryBus = {
      execute: vi.fn().mockResolvedValue(user.toJSON()),
    } as unknown as QueryBus;

    const controller = new UsersController(commandBus, queryBus);
    const result = await controller.getUser(user.id);

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetUserQuery));
    expect(result.id).toBe(user.id);
    expect(result.email).toBe('alice@example.test');
  });

  it('fetches user overview via GetUserOverviewQuery', async () => {
    const overview = {
      id: '019488e0-0000-7000-8000-000000000001',
      username: 'Alice',
      email: 'alice@example.test',
      department: 'Engineering',
      roles: ['admin'],
      capabilities: ['User:read'],
    };
    const commandBus = { execute: vi.fn() } as unknown as CommandBus;
    const queryBus = {
      execute: vi.fn().mockResolvedValue(overview),
    } as unknown as QueryBus;

    const controller = new UsersController(commandBus, queryBus);
    const result = await controller.getUserOverview(overview.id);

    expect(queryBus.execute).toHaveBeenCalledWith(
      expect.any(GetUserOverviewQuery),
    );
    expect(result).toEqual(overview);
  });

  it('throws NotFoundException when user overview is not found', async () => {
    const commandBus = { execute: vi.fn() } as unknown as CommandBus;
    const queryBus = {
      execute: vi.fn().mockResolvedValue(null),
    } as unknown as QueryBus;

    const controller = new UsersController(commandBus, queryBus);
    await expect(
      controller.getUserOverview('019488e0-0000-7000-8000-000000000001'),
    ).rejects.toThrow(NotFoundException);
  });
});
