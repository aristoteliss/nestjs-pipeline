import type { ICache } from '@nestjs-pipeline/ddd-core';
import { ZodValidationBehavior } from '@nestjs-pipeline/zod';
import { describe, expect, it, vi } from 'vitest';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { User } from '../domain/models/user.entity';
import { GetUserQueryRepository } from './get-user.query-repository';

describe('GetUserQueryRepository cache policy', () => {
  it('preserves hydration metadata through global payload validation', async () => {
    const persisted = User.create(
      'Alice',
      'alice@example.test',
      'engineering',
    ).entity;
    const cache: ICache<User> = {
      get: vi.fn().mockResolvedValue(persisted.toJSON()),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const store = { em: { findOne: vi.fn() } };
    const repository = new GetUserQueryRepository(cache, store as never);
    const query = new GetUserQuery({ userId: persisted.id }, { hydrate: true });

    await new ZodValidationBehavior().handle(
      {
        request: query,
        requestType: GetUserQuery,
      } as never,
      async () => undefined,
    );
    const result = await repository.find(query);

    expect(query.hydrate).toBe(true);
    expect(result).toBeInstanceOf(User);
    expect(store.em.findOne).not.toHaveBeenCalled();
  });

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
