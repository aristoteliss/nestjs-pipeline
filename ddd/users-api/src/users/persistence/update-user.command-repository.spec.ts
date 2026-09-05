import type { ICache } from '@nestjs-pipeline/ddd-core';
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
    const user = User.create('Alice', 'alice@example.test').entity;
    const outcome = user.update({ username: 'Alicia' });
    const upsert = vi.fn().mockResolvedValue(user);
    const store = {
      get em() {
        return { upsert };
      },
    };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    await expect(repository.save(outcome)).resolves.toEqual(user.toJSON());
    expect(upsert).toHaveBeenCalledWith(User, user);
    expect(cache.delete).toHaveBeenCalledWith(
      'tenant:user:email:alice@example.test',
    );
    expect(cache.set).toHaveBeenCalledWith(
      `tenant:user:id:${user.id}`,
      user.toJSON(),
    );
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(cache.delete).mock.invocationCallOrder[0],
    );
  });

  it('does not touch cache when the database update fails', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test').entity;
    const failure = new Error('database failed');
    const upsert = vi.fn().mockRejectedValue(failure);
    const store = {
      get em() {
        return { upsert };
      },
    };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    await expect(
      repository.save(user.update({ username: 'Alicia' })),
    ).rejects.toBe(failure);
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
