import type { ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import { DeleteUserCommandRepository } from './delete-user.command-repository';

describe('DeleteUserCommandRepository', () => {
  it('runs relation cleanup and user delete in one transaction, then evicts tenant-aware keys', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const execute = vi.fn().mockResolvedValue(undefined);
    const nativeDelete = vi.fn().mockResolvedValue(1);
    const tx = { execute, nativeDelete };
    const transactional = vi.fn(async (work: (em: typeof tx) => Promise<void>) => {
      await work(tx);
    });
    const store = {
      get em() {
        return { transactional };
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
    expect(transactional).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledTimes(3);
    expect(nativeDelete).toHaveBeenCalledWith(User, user.id);
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.delete).toHaveBeenCalledWith(`tenant:user:_id:${user.id}`);
    expect(cache.delete).toHaveBeenCalledWith(
      'tenant:user:email:alice@example.test',
    );
  });

  it('does not evict cache when the database transaction fails', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const failure = new Error('delete failed');
    const transactional = vi.fn().mockRejectedValue(failure);
    const store = {
      get em() {
        return { transactional };
      },
    };
    const repository = new DeleteUserCommandRepository(cache, store as never);
    const user = User.create('Alice', 'alice@example.test').entity;

    await expect(repository.save(user.delete())).rejects.toBe(failure);

    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
