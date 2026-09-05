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
import { CreateRoleCommand } from '../cqrs/commands/create-role.command';
import { DeleteRoleCommand } from '../cqrs/commands/delete-role.command';
import { UpdateRoleCommand } from '../cqrs/commands/update-role.command';
import { GetRoleQuery } from '../cqrs/queries/get-role.query';
import { GetRolesQuery } from '../cqrs/queries/get-roles.query';
import { Role } from '../domain/models/role.entity';
import { RolesController } from './roles.controller';

describe('RolesController', () => {
  it('creates role and maps aggregate to response DTO', async () => {
    const role = Role.create('admin');
    const commandBus = {
      execute: vi.fn().mockResolvedValue(role),
    } as unknown as CommandBus;
    const queryBus = { execute: vi.fn() } as unknown as QueryBus;

    const controller = new RolesController(commandBus, queryBus);
    const result = await controller.createRole({ name: 'admin' });

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(CreateRoleCommand));
    expect(result).toEqual({
      id: role.id,
      name: 'admin',
    });
  });

  it('updates role and maps aggregate to response DTO', async () => {
    const role = Role.create('editor');
    role.rename('publisher');

    const commandBus = {
      execute: vi.fn().mockResolvedValue(role),
    } as unknown as CommandBus;
    const queryBus = { execute: vi.fn() } as unknown as QueryBus;

    const controller = new RolesController(commandBus, queryBus);
    const result = await controller.updateRole(role.id, { name: 'publisher' });

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(UpdateRoleCommand));
    expect(result.name).toBe('publisher');
  });

  it('deletes role via DeleteRoleCommand', async () => {
    const commandBus = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as CommandBus;
    const queryBus = { execute: vi.fn() } as unknown as QueryBus;

    const controller = new RolesController(commandBus, queryBus);
    await controller.deleteRole('019488e0-0000-7000-8000-000000000001');

    expect(commandBus.execute).toHaveBeenCalledWith(expect.any(DeleteRoleCommand));
  });

  it('fetches role list via GetRolesQuery', async () => {
    const role = Role.create('viewer');
    const commandBus = { execute: vi.fn() } as unknown as CommandBus;
    const queryBus = {
      execute: vi.fn().mockResolvedValue([role.toJSON()]),
    } as unknown as QueryBus;

    const controller = new RolesController(commandBus, queryBus);
    const result = await controller.getRoles({} as Request);

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetRolesQuery));
    expect(result.roles).toHaveLength(1);
    expect(result.roles[0].name).toBe('viewer');
  });

  it('fetches single role via GetRoleQuery', async () => {
    const role = Role.create('viewer');
    const commandBus = { execute: vi.fn() } as unknown as CommandBus;
    const queryBus = {
      execute: vi.fn().mockResolvedValue(role.toJSON()),
    } as unknown as QueryBus;

    const controller = new RolesController(commandBus, queryBus);
    const result = await controller.getRole(role.id);

    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetRoleQuery));
    expect(result.id).toBe(role.id);
    expect(result.name).toBe('viewer');
  });
});
