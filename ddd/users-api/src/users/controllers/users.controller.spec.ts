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

import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { describe, expect, it, vi } from 'vitest';
import { CreateUserCommand } from '../cqrs/commands/create-user.command';
import { DeleteUserCommand } from '../cqrs/commands/delete-user.command';
import { UpdateUserCommand } from '../cqrs/commands/update-user.command';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { GetUsersQuery } from '../cqrs/queries/get-users.query';
import { User } from '../domain/models/user.entity';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('creates user and maps aggregate to response DTO', async () => {
    const user = User.create('Alice', 'alice@example.test', 'Engineering');
    const commandBus = {
      execute: vi.fn().mockResolvedValue(user),
    } as unknown as CommandBus;
    const queryBus = { execute: vi.fn() } as unknown as QueryBus;

    const controller = new UsersController(commandBus, queryBus);
    const result = await controller.createUser({
      name: 'Alice',
      email: 'alice@example.test',
      department: 'Engineering',
    });

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateUserCommand));
    expect(result).toEqual({
      id: user.id,
      name: 'Alice',
      email: 'alice@example.test',
      department: 'Engineering',
    });
  });

  it('updates user and maps aggregate to response DTO', async () => {
    const user = User.create('Alice', 'alice@example.test', 'Engineering');
    user.update({ username: 'Alicia' });

    const commandBus = {
      execute: vi.fn().mockResolvedValue(user),
    } as unknown as CommandBus;
    const queryBus = { execute: vi.fn() } as unknown as QueryBus;

    const controller = new UsersController(commandBus, queryBus);
    const result = await controller.updateUser(user.id, {
      name: 'Alicia',
    });

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(UpdateUserCommand));
    expect(result.name).toBe('Alicia');
  });

  it('deletes user via DeleteUserCommand', async () => {
    const commandBus = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as CommandBus;
    const queryBus = { execute: vi.fn() } as unknown as QueryBus;

    const controller = new UsersController(commandBus, queryBus);
    await controller.deleteUser('019488e0-0000-7000-8000-000000000001');

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(DeleteUserCommand));
  });

  it('fetches user list via GetUsersQuery', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const commandBus = { execute: vi.fn() } as unknown as CommandBus;
    const queryBus = {
      execute: vi.fn().mockResolvedValue([user.toJSON()]),
    } as unknown as QueryBus;

    const controller = new UsersController(commandBus, queryBus);
    const result = await controller.getUsers({} as Request);

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
});
