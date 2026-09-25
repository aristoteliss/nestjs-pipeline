/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  type AppAbility,
  buildAbility,
  CaslAuthorizer,
} from '@nestjs-pipeline/casl';
import { describe, expect, it, vi } from 'vitest';
import { CreateRoleCommand } from '../cqrs/commands/create-role.command';
import { DeleteRoleCommand } from '../cqrs/commands/delete-role.command';
import { UpdateRoleCommand } from '../cqrs/commands/update-role.command';
import { GetRoleHandler } from '../cqrs/queries/get-role.handler';
import { GetRoleQuery } from '../cqrs/queries/get-role.query';
import { GetRolesQuery } from '../cqrs/queries/get-roles.query';
import { Role } from '../domain/models/role.entity';
import { CreateRoleDtoSchema } from '../dtos/create-role.dto';
import { UpdateRoleDtoSchema } from '../dtos/update-role.dto';
import { RolesController } from './roles.controller';

describe('RolesController', () => {
  function readingBus(ability: AppAbility, role: Role): QueryBus {
    const handler = new GetRoleHandler(
      { find: vi.fn().mockResolvedValue(role) },
      new CaslAuthorizer(ability),
    );
    return {
      execute: vi.fn((query: GetRoleQuery) => handler.execute(query)),
    } as unknown as QueryBus;
  }

  function writingBus(result: unknown): CommandBus {
    return {
      execute: vi.fn().mockResolvedValue(result),
    } as unknown as CommandBus;
  }

  it('creates a role and answers with a fresh authorized read', async () => {
    const role = Role.create('admin');
    const commandBus = writingBus(role);
    const queryBus = readingBus(buildAbility(['Role|read|*']), role);

    const result = await new RolesController(commandBus, queryBus).createRole({
      name: 'admin',
    });

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.any(CreateRoleCommand),
    );
    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetRoleQuery));
    expect(result).toEqual({ id: role.id, name: 'admin' });
  });

  it('answers an update with only the fields the caller may read', async () => {
    const role = Role.create('editor');
    role.rename('publisher');
    const commandBus = writingBus(role);

    const result = await new RolesController(
      commandBus,
      readingBus(buildAbility(['Role|update|*', 'Role|read|*|name']), role),
    ).updateRole(role.id, { name: 'publisher' });

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.any(UpdateRoleCommand),
    );
    expect(result).toEqual({ name: 'publisher' });
  });

  it.each([
    [
      'create',
      (c: RolesController, _id: string) => c.createRole({ name: 'admin' }),
    ],
    [
      'update',
      (c: RolesController, id: string) => c.updateRole(id, { name: 'admin' }),
    ],
  ])(
    'answers a write-only caller with an empty body (%s)',
    async (_, write) => {
      const role = Role.create('admin');
      const commandBus = writingBus(role);
      const controller = new RolesController(
        commandBus,
        readingBus(buildAbility(['Role|create|*', 'Role|update|*']), role),
      );

      await expect(write(controller, role.id)).resolves.toEqual({});
      expect(commandBus.execute).toHaveBeenCalledOnce();
    },
  );

  it('deletes role via DeleteRoleCommand', async () => {
    const commandBus = {
      execute: vi.fn().mockResolvedValue(undefined),
    } as unknown as CommandBus;
    const queryBus = { execute: vi.fn() } as unknown as QueryBus;

    const controller = new RolesController(commandBus, queryBus);
    await controller.deleteRole('019488e0-0000-7000-8000-000000000001');

    expect(commandBus.execute).toHaveBeenCalledWith(
      expect.any(DeleteRoleCommand),
    );
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

  describe('DTO and command schema validation', () => {
    it('rejects whitespace-only role name in CreateRoleDtoSchema', () => {
      const result = CreateRoleDtoSchema.safeParse({ name: '   ' });
      expect(result.success).toBe(false);
    });

    it('rejects whitespace-only role name in UpdateRoleDtoSchema', () => {
      const result = UpdateRoleDtoSchema.safeParse({ name: '   ' });
      expect(result.success).toBe(false);
    });

    it('trims valid role names in CreateRoleDtoSchema', () => {
      const result = CreateRoleDtoSchema.safeParse({ name: '  admin  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('admin');
      }
    });

    it('trims valid role names in UpdateRoleDtoSchema', () => {
      const result = UpdateRoleDtoSchema.safeParse({ name: '  editor  ' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('editor');
      }
    });
  });
});
