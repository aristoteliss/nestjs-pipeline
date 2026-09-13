import type { ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import { CreateUserCommandRepository } from './create-user.command-repository';

describe('CreateUserCommandRepository', () => {
  it('persists, caches by id, and invalidates the secondary email lookup', async () => {
    const cache: ICache<UserSnapshot> = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    const create = vi.fn().mockReturnValue(user);
    const persist = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = { get em() { return { create, persist, flush }; } };
    const repository = new CreateUserCommandRepository(cache, store as never);

    const result = await repository.save(user);

    expect(cache.set).toHaveBeenCalledWith(`tenant:user:id:${user.id}`, result);
    expect(cache.delete).toHaveBeenCalledWith('tenant:user:email:alice@example.test');
  });

  it('translates database unique constraint violations into UniqueEmailException', async () => {
    const cache: ICache<UserSnapshot> = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    const store = { get em() { return { create: vi.fn().mockReturnValue(user), persist: vi.fn(), flush: vi.fn().mockRejectedValue({ code: 'SQLITE_CONSTRAINT_UNIQUE' }) }; } };
    const repository = new CreateUserCommandRepository(cache, store as never);
    await expect(repository.save(user)).rejects.toThrow('Email alice@example.test already exists');
  });
});
