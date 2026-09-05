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

import { NotFoundException } from '@nestjs/common';
import type { EventBus } from '@nestjs/cqrs';
import { describe, expect, it, vi } from 'vitest';
import { UserCreatedEvent } from '../../domain/events/user-created.event';
import { UserDeletedEvent } from '../../domain/events/user-deleted.event';
import { UserUpdatedEvent } from '../../domain/events/user-updated.event';
import { User } from '../../domain/models/user.entity';
import { CreateUserCommand } from './create-user.command';
import { CreateUserHandler } from './create-user.handler';
import { DeleteUserCommand } from './delete-user.command';
import { DeleteUserHandler } from './delete-user.handler';
import { UpdateUserCommand } from './update-user.command';
import { UpdateUserHandler } from './update-user.handler';

describe('Users CQRS Command Handlers', () => {
  const authorizer = {
    authorize: vi.fn(),
    can: vi.fn(() => true),
  } as never;

  describe('CreateUserHandler', () => {
    it('creates aggregate, persists via save(user), and publishes UserCreatedEvent via CommandBaseHandler', async () => {
      const eventBus = {
        publishAll: vi.fn(),
      } as unknown as EventBus;

      const save = vi.fn().mockResolvedValue({ id: 'persisted-id' });
      const commandRepository = { save };

      const handler = new CreateUserHandler(
        commandRepository as never,
        authorizer,
        eventBus,
      );

      const command = new CreateUserCommand({
        username: 'Alice',
        email: 'alice@example.test',
        department: 'Engineering',
      });

      const result = await handler.execute(command);

      expect(result).toBeInstanceOf(User);
      expect(result.username).toBe('Alice');
      expect(result.email).toBe('alice@example.test');
      expect(authorizer.authorize).toHaveBeenCalledWith(
        'create',
        result,
        ['username', 'email', 'department'],
      );
      expect(save).toHaveBeenCalledWith(result);
      expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
      expect(eventBus.publishAll).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(UserCreatedEvent)]),
      );
      expect(result.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('UpdateUserHandler', () => {
    it('hydrates aggregate, mutates via user.update, saves entity, and publishes UserUpdatedEvent', async () => {
      const existingUser = User.create('Bob', 'bob@example.test', 'Sales');
      // clear create event so we can test only the update event
      existingUser.uncommit();

      const eventBus = {
        publishAll: vi.fn(),
      } as unknown as EventBus;

      const queryRepository = {
        find: vi.fn().mockResolvedValue(existingUser),
      };
      const save = vi.fn().mockResolvedValue({ id: existingUser.id });
      const commandRepository = { save };

      const handler = new UpdateUserHandler(
        queryRepository as never,
        commandRepository as never,
        authorizer,
        eventBus,
      );

      const command = new UpdateUserCommand({
        id: existingUser.id,
        username: 'Bobby',
        department: 'Marketing',
      });

      const result = await handler.execute(command);

      expect(result).toBeInstanceOf(User);
      expect(result.username).toBe('Bobby');
      expect(result.department).toBe('Marketing');
      expect(save).toHaveBeenCalledWith(result);
      expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
      expect(eventBus.publishAll).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(UserUpdatedEvent)]),
      );
      expect(result.getUncommittedEvents()).toHaveLength(0);
    });

    it('throws NotFoundException when user does not exist', async () => {
      const eventBus = { publishAll: vi.fn() } as unknown as EventBus;
      const queryRepository = { find: vi.fn().mockResolvedValue(null) };
      const commandRepository = { save: vi.fn() };

      const handler = new UpdateUserHandler(
        queryRepository as never,
        commandRepository as never,
        authorizer,
        eventBus,
      );

      const command = new UpdateUserCommand({
        id: '019488e0-0000-7000-8000-000000000001',
        username: 'NewName',
      });

      await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    });
  });

  describe('DeleteUserHandler', () => {
    it('hydrates aggregate, mutates via user.delete, saves entity, and publishes UserDeletedEvent', async () => {
      const existingUser = User.create('Carol', 'carol@example.test');
      existingUser.uncommit();

      const eventBus = {
        publishAll: vi.fn(),
      } as unknown as EventBus;

      const queryRepository = {
        find: vi.fn().mockResolvedValue(existingUser),
      };
      const save = vi.fn().mockResolvedValue(null);
      const commandRepository = { save };

      const handler = new DeleteUserHandler(
        queryRepository as never,
        commandRepository as never,
        authorizer,
        eventBus,
      );

      const command = new DeleteUserCommand({ id: existingUser.id });
      const result = await handler.execute(command);

      expect(result).toBeInstanceOf(User);
      expect(authorizer.authorize).toHaveBeenCalledWith('delete', existingUser);
      expect(save).toHaveBeenCalledWith(result);
      expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
      expect(eventBus.publishAll).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(UserDeletedEvent)]),
      );
      expect(result.getUncommittedEvents()).toHaveLength(0);
    });

    it('throws NotFoundException when deleting non-existent user', async () => {
      const eventBus = { publishAll: vi.fn() } as unknown as EventBus;
      const queryRepository = { find: vi.fn().mockResolvedValue(null) };
      const commandRepository = { save: vi.fn() };

      const handler = new DeleteUserHandler(
        queryRepository as never,
        commandRepository as never,
        authorizer,
        eventBus,
      );

      const command = new DeleteUserCommand({
        id: '019488e0-0000-7000-8000-000000000001',
      });

      await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    });
  });
});
