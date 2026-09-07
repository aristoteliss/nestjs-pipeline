import { OptimisticLockError } from '@mikro-orm/core';
import {
  EntityNotFoundException,
  type ICache,
} from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception';
import { Role, type RoleSnapshot } from '../domain/models/role.entity';
import { UpdateRoleCommandRepository } from './update-role.command-repository';

describe('UpdateRoleCommandRepository', () => {
  it('updates role and refreshes cache snapshot by id', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('publisher');
    const nativeUpdate = vi.fn().mockResolvedValue(1);
    const store = { get em() { return { nativeUpdate }; } };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    const result = await repository.save(role);

    expect(nativeUpdate).toHaveBeenCalledWith(
      Role,
      { id: role.id, version: 1 },
      { name: 'publisher', updatedAt: role.updatedAt, version: 2 },
    );
    expect(cache.set).toHaveBeenCalledWith(`tenant:role:id:${role.id}`, result);
    expect(result).toEqual(role.toJSON());
  });

  it('throws EntityNotFoundException when a concurrent delete removed the role', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('publisher');
    const nativeUpdate = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue(null);
    const store = { get em() { return { nativeUpdate, findOne }; } };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toBeInstanceOf(
      EntityNotFoundException,
    );
    expect(findOne).toHaveBeenCalledWith(
      Role,
      { id: role.id },
      { refresh: true },
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('throws OptimisticLockError when the role still exists at a newer version', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('publisher');
    const nativeUpdate = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue({ id: role.id, version: 2 });
    const store = { get em() { return { nativeUpdate, findOne }; } };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow(OptimisticLockError);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('translates unique constraint violations into UniqueRoleNameException', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('admin');
    const store = {
      get em() {
        return {
          nativeUpdate: vi
            .fn()
            .mockRejectedValue({ code: 'SQLITE_CONSTRAINT_UNIQUE' }),
        };
      },
    };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow(
      UniqueRoleNameException,
    );
  });
});
