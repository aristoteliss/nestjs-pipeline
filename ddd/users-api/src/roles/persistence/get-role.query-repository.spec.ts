import { type ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { GetRoleQuery } from '../cqrs/queries/get-role.query';
import { Role } from '../domain/models/role.entity';
import { GetRoleQueryRepository } from './get-role.query-repository';

function createCachedRoleFixture() {
  const role = Role.create('admin');
  const snapshot = role.toJSON();
  const cache: ICache<Role> = {
    get: vi.fn().mockResolvedValue(snapshot as unknown as Role),
    set: vi.fn(),
    delete: vi.fn(),
  };
  const findOne = vi.fn();
  const store = {
    get em() {
      return { findOne };
    },
  };

  return {
    role,
    cache,
    findOne,
    queryRepository: new GetRoleQueryRepository(cache, store as never),
  };
}

describe('GetRoleQueryRepository cache hydration', () => {
  it('hydrates a cached role snapshot for GetRoleQuery', async () => {
    const { role, cache, findOne, queryRepository } = createCachedRoleFixture();

    const result = await queryRepository.find(
      new GetRoleQuery({ roleId: role.id }, { hydrate: true }),
    );

    expect(result).toBeInstanceOf(Role);
    expect(result?.name).toBe('admin');
    expect(cache.get).toHaveBeenCalledWith(`tenant:role:id:${role.id}`);
    expect(findOne).not.toHaveBeenCalled();
  });
});
