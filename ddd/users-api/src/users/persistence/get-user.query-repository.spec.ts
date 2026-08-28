import type { ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { User } from '../domain/models/user.entity';
import { GetUserQueryRepository } from './get-user.query-repository';

describe('GetUserQueryRepository cache policy', () => {
  it('bypasses cache for a lookup that includes mutable department criteria', async () => {
    const cache: ICache<User> = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const persisted = User.create(
      'Alice',
      'alice@example.test',
      'engineering',
    ).entity;
    const findOne = vi.fn().mockResolvedValue(persisted);
    const store = {
      get em() {
        return { findOne };
      },
    };
    const repository = new GetUserQueryRepository(cache, store as never);
    const query = new GetUserQuery({
      userId: persisted.id,
      department: 'engineering',
    });

    const result = await repository.find(query);

    expect(result).toBe(persisted);
    expect(findOne).toHaveBeenCalledOnce();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });
});
