import { type ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { GetRoleQuery } from '../cqrs/queries/get-role.query';
import { Role, type RoleSnapshot } from '../domain/models/role.entity';
import { GetRoleQueryRepository } from './get-role.query-repository';

function createCachedRoleFixture() {
  const role = Role.create('admin');
  const snapshot = role.toJSON();
  const cache: ICache<RoleSnapshot> = {
    get: vi.fn().mockResolvedValue(snapshot),
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
  it('hydrates a cached role snapshot for GetRoleQuery by default', async () => {
    const { role, cache, findOne, queryRepository } = createCachedRoleFixture();

    const result = await queryRepository.find(
      new GetRoleQuery({ roleId: role.id }),
    );

    expect(result).toBeInstanceOf(Role);
    expect(result?.name).toBe('admin');
    expect(cache.get).toHaveBeenCalledWith(`tenant:role:id:${role.id}`);
    expect(findOne).not.toHaveBeenCalled();
  });
});
