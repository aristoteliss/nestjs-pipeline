import { OptimisticLockError } from '@mikro-orm/core';
import {
  EntityNotFoundException,
  type ICache,
} from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import { UpdateUserCommandRepository } from './update-user.command-repository';

describe('UpdateUserCommandRepository', () => {
  it('writes the database before best-effort email invalidation and id refresh', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn().mockRejectedValue(new Error('cache set failed')),
      delete: vi.fn().mockRejectedValue(new Error('cache delete failed')),
    };
    const user = User.create('Alice', 'alice@example.test');
    user.update({ username: 'Alicia' });
    const nativeUpdate = vi.fn().mockResolvedValue(1);
    const store = { get em() { return { nativeUpdate }; } };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    await expect(repository.save(user)).resolves.toEqual(user.toJSON());
    expect(nativeUpdate).toHaveBeenCalledWith(
      User,
      { id: user.id, version: 1 },
      {
        username: 'Alicia',
        department: null,
        updatedAt: user.updatedAt,
        version: 2,
      },
    );
    expect(cache.delete).toHaveBeenCalledWith(
      'tenant:user:email:alice@example.test',
    );
    expect(cache.set).toHaveBeenCalledWith(
      `tenant:user:id:${user.id}`,
      user.toJSON(),
    );
  });

  it('throws EntityNotFoundException when a concurrent delete removed the user', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test');
    const nativeUpdate = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue(null);
    const store = { get em() { return { nativeUpdate, findOne }; } };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    user.update({ username: 'Alicia' });
    await expect(repository.save(user)).rejects.toBeInstanceOf(
      EntityNotFoundException,
    );
    expect(findOne).toHaveBeenCalledWith(
      User,
      { id: user.id },
      { refresh: true },
    );
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('throws OptimisticLockError when the user still exists at a newer version', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test');
    const nativeUpdate = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue({ id: user.id, version: 2 });
    const store = { get em() { return { nativeUpdate, findOne }; } };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    user.update({ username: 'Alicia' });
    await expect(repository.save(user)).rejects.toThrow(OptimisticLockError);
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not touch cache when the database update fails', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test');
    const failure = new Error('database failed');
    const nativeUpdate = vi.fn().mockRejectedValue(failure);
    const store = { get em() { return { nativeUpdate }; } };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    user.update({ username: 'Alicia' });
    await expect(repository.save(user)).rejects.toBe(failure);
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
