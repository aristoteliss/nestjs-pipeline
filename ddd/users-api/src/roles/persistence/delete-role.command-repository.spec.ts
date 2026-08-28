import type { ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../domain/models/role.entity';
import { DeleteRoleCommandRepository } from './delete-role.command-repository';

describe('DeleteRoleCommandRepository', () => {
  it('evicts the tenant-aware query key and never caches the delete count', async () => {
    const cache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const nativeDelete = vi.fn().mockResolvedValue(1);
    const store = {
      get em() {
        return { nativeDelete };
      },
    };
    const repository = new DeleteRoleCommandRepository(cache, store as never);
    const role = Role.create('admin').entity;

    const result = await repository.save(role.delete());

    expect(result).toBeNull();
    expect(nativeDelete).toHaveBeenCalledWith(Role, { id: role.id });
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.delete).toHaveBeenCalledWith(`tenant:role:id:${role.id}`);
  });
});
