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
import { RoleCreatedEvent } from '../../domain/events/role-created.event';
import { RoleDeletedEvent } from '../../domain/events/role-deleted.event';
import { RoleUpdatedEvent } from '../../domain/events/role-updated.event';
import { Role } from '../../domain/models/role.entity';
import { CreateRoleCommand } from './create-role.command';
import { CreateRoleHandler } from './create-role.handler';
import { DeleteRoleCommand } from './delete-role.command';
import { DeleteRoleHandler } from './delete-role.handler';
import { UpdateRoleCommand } from './update-role.command';
import { UpdateRoleHandler } from './update-role.handler';

describe('Roles CQRS Command Handlers', () => {
  const authorizer = {
    authorize: vi.fn(),
    can: vi.fn(() => true),
  } as never;

  describe('CreateRoleHandler', () => {
    it('creates aggregate, persists via save(role), and publishes RoleCreatedEvent via CommandBaseHandler', async () => {
      const eventBus = {
        publishAll: vi.fn(),
      } as unknown as EventBus;

      const save = vi.fn().mockResolvedValue({ id: 'role-id', name: 'admin' });
      const commandRepository = { save };

      const handler = new CreateRoleHandler(
        commandRepository as never,
        authorizer,
        eventBus,
      );

      const command = new CreateRoleCommand({ name: 'admin' });
      const result = await handler.execute(command);

      expect(result).toBeInstanceOf(Role);
      expect(result.name).toBe('admin');
      expect(authorizer.authorize).toHaveBeenCalledWith(
        'create',
        result,
        ['name'],
      );
      expect(save).toHaveBeenCalledWith(result);
      expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
      expect(eventBus.publishAll).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(RoleCreatedEvent)]),
      );
      expect(result.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('UpdateRoleHandler', () => {
    it('hydrates aggregate, renames via role.rename, saves entity, and publishes RoleUpdatedEvent', async () => {
      const existingRole = Role.create('editor');
      existingRole.uncommit();

      const eventBus = {
        publishAll: vi.fn(),
      } as unknown as EventBus;

      const queryRepository = {
        find: vi.fn().mockResolvedValue(existingRole),
      };
      const save = vi.fn().mockResolvedValue({ id: existingRole.id, name: 'publisher' });
      const commandRepository = { save };

      const handler = new UpdateRoleHandler(
        queryRepository as never,
        commandRepository as never,
        authorizer,
        eventBus,
      );

      const command = new UpdateRoleCommand({
        id: existingRole.id,
        name: 'publisher',
      });

      const result = await handler.execute(command);

      expect(result).toBeInstanceOf(Role);
      expect(result.name).toBe('publisher');
      expect(authorizer.authorize).toHaveBeenCalledWith(
        'update',
        result,
        ['name'],
      );
      expect(save).toHaveBeenCalledWith(result);
      expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
      expect(eventBus.publishAll).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(RoleUpdatedEvent)]),
      );
      expect(result.getUncommittedEvents()).toHaveLength(0);
    });

    it('throws NotFoundException when role does not exist', async () => {
      const eventBus = { publishAll: vi.fn() } as unknown as EventBus;
      const queryRepository = { find: vi.fn().mockResolvedValue(null) };
      const commandRepository = { save: vi.fn() };

      const handler = new UpdateRoleHandler(
        queryRepository as never,
        commandRepository as never,
        authorizer,
        eventBus,
      );

      const command = new UpdateRoleCommand({
        id: '019488e0-0000-7000-8000-000000000001',
        name: 'newname',
      });

      await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    });
  });

  describe('DeleteRoleHandler', () => {
    it('hydrates aggregate, mutates via role.delete, saves entity, and publishes RoleDeletedEvent', async () => {
      const existingRole = Role.create('viewer');
      existingRole.uncommit();

      const eventBus = {
        publishAll: vi.fn(),
      } as unknown as EventBus;

      const queryRepository = {
        find: vi.fn().mockResolvedValue(existingRole),
      };
      const save = vi.fn().mockResolvedValue(null);
      const commandRepository = { save };

      const handler = new DeleteRoleHandler(
        queryRepository as never,
        commandRepository as never,
        authorizer,
        eventBus,
      );

      const command = new DeleteRoleCommand({ id: existingRole.id });
      const result = await handler.execute(command);

      expect(result).toBeInstanceOf(Role);
      expect(authorizer.authorize).toHaveBeenCalledWith('delete', existingRole);
      expect(save).toHaveBeenCalledWith(result);
      expect(eventBus.publishAll).toHaveBeenCalledTimes(1);
      expect(eventBus.publishAll).toHaveBeenCalledWith(
        expect.arrayContaining([expect.any(RoleDeletedEvent)]),
      );
      expect(result.getUncommittedEvents()).toHaveLength(0);
    });

    it('throws NotFoundException when deleting non-existent role', async () => {
      const eventBus = { publishAll: vi.fn() } as unknown as EventBus;
      const queryRepository = { find: vi.fn().mockResolvedValue(null) };
      const commandRepository = { save: vi.fn() };

      const handler = new DeleteRoleHandler(
        queryRepository as never,
        commandRepository as never,
        authorizer,
        eventBus,
      );

      const command = new DeleteRoleCommand({
        id: '019488e0-0000-7000-8000-000000000001',
      });

      await expect(handler.execute(command)).rejects.toThrow(NotFoundException);
    });
  });
});
