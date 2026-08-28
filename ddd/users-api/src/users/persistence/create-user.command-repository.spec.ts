import type { ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import { CreateUserCommandRepository } from './create-user.command-repository';

describe('CreateUserCommandRepository', () => {
  it('invalidates a stale email miss after persistence and caches the user by id', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const outcome = User.create(
      'Alice',
      'alice@example.test',
      'engineering',
    );
    const create = vi.fn().mockReturnValue(outcome.entity);
    const persist = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = {
      get em() {
        return { create, persist, flush };
      },
    };
    const repository = new CreateUserCommandRepository(cache, store as never);

    const result = await repository.save(outcome);

    expect(create).toHaveBeenCalledWith(User, outcome.entity);
    expect(persist).toHaveBeenCalledWith(outcome.entity);
    expect(flush).toHaveBeenCalledOnce();
    expect(cache.delete).toHaveBeenCalledWith(
      'tenant:user:email:alice@example.test',
    );
    expect(cache.set).toHaveBeenCalledWith(
      `tenant:user:_id:${outcome.entity.id}`,
      result,
    );
  });
});
