import { TransientOperationError } from '@common/resilience/transient-operation.error';
import type { ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { Role, type RoleSnapshot } from '../domain/models/role.entity';
import { DeleteRoleCommandRepository } from './delete-role.command-repository';

describe('DeleteRoleCommandRepository', () => {
  it('evicts the tenant-aware query key and never caches the delete count', async () => {
    const cache: ICache<RoleSnapshot> = {
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
    const role = Role.create('admin');

    role.delete();
    const result = await repository.save(role);

    expect(result).toBeNull();
    expect(nativeDelete).toHaveBeenCalledWith(Role, { id: role.id });
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.delete).toHaveBeenCalledWith(`tenant:role:id:${role.id}`);
  });

  it('translates transient database failures into TransientOperationError', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const transientError = Object.assign(new Error('deadlock detected'), {
      code: '40P01',
    });
    const nativeDelete = vi.fn().mockRejectedValue(transientError);
    const store = {
      get em() {
        return { nativeDelete };
      },
    };
    const repository = new DeleteRoleCommandRepository(cache, store as never);
    const role = Role.create('admin');
    role.delete();

    await expect(repository.save(role)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof TransientOperationError &&
        (err as Error & { cause?: unknown }).cause === transientError,
    );
  });
});
