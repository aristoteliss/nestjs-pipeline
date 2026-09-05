import type { ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import { DeleteUserCommandRepository } from './delete-user.command-repository';

describe('DeleteUserCommandRepository', () => {
  it('deletes user entity directly relying on ON DELETE CASCADE and evicts tenant-aware keys', async () => {
    const cache: ICache<UserSnapshot> = {
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
    const repository = new DeleteUserCommandRepository(cache, store as never);
    const user = User.create(
      'Alice',
      'alice@example.test',
      'engineering',
    ).entity;

    const result = await repository.save(user.delete());

    expect(result).toBeNull();
    expect(nativeDelete).toHaveBeenCalledWith(User, user.id);
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.delete).toHaveBeenCalledWith(`tenant:user:id:${user.id}`);
    expect(cache.delete).toHaveBeenCalledWith(
      'tenant:user:email:alice@example.test',
    );
  });

  it('does not evict cache when the database delete fails', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const failure = new Error('delete failed');
    const nativeDelete = vi.fn().mockRejectedValue(failure);
    const store = {
      get em() {
        return { nativeDelete };
      },
    };
    const repository = new DeleteUserCommandRepository(cache, store as never);
    const user = User.create('Alice', 'alice@example.test').entity;

    await expect(repository.save(user.delete())).rejects.toBe(failure);

    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
