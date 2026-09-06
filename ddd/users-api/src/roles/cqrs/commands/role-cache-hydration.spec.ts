import { type ICache } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { Role } from '../../domain/models/role.entity';
import { GetRoleQueryRepository } from '../../persistence/get-role.query-repository';
import { DeleteRoleCommand } from './delete-role.command';
import { DeleteRoleHandler } from './delete-role.handler';
import { UpdateRoleCommand } from './update-role.command';
import { UpdateRoleHandler } from './update-role.handler';

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

describe('role command cache hydration', () => {
  const authorizer = {
    authorize: vi.fn(),
    can: vi.fn(() => true),
  } as never;

  it('hydrates a cached role snapshot before updating it', async () => {
    const { role, cache, findOne, queryRepository } = createCachedRoleFixture();
    const save = vi.fn().mockResolvedValue(undefined);
    const handler = new UpdateRoleHandler(
      queryRepository,
      { save } as never,
      authorizer,
      { publishAll: vi.fn() } as never,
    );

    const result = await handler.handle(
      new UpdateRoleCommand({ id: role.id, name: 'editor' }),
    );

    expect(result).toBeInstanceOf(Role);
    expect(result.name).toBe('editor');
    expect(save).toHaveBeenCalledWith(result);
    expect(cache.get).toHaveBeenCalledWith(`tenant:role:id:${role.id}`);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('hydrates a cached role snapshot before deleting it', async () => {
    const { role, cache, findOne, queryRepository } = createCachedRoleFixture();
    const save = vi.fn().mockResolvedValue(undefined);
    const handler = new DeleteRoleHandler(
      queryRepository,
      { save } as never,
      authorizer,
      { publishAll: vi.fn() } as never,
    );

    const result = await handler.handle(new DeleteRoleCommand({ id: role.id }));

    expect(result).toBeInstanceOf(Role);
    expect(save).toHaveBeenCalledWith(result);
    expect(cache.get).toHaveBeenCalledWith(`tenant:role:id:${role.id}`);
    expect(findOne).not.toHaveBeenCalled();
  });
});
