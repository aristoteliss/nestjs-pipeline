import { type ICache, RootEntity } from '@nestjs-pipeline/ddd-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Role } from '../../domain/models/role.entity';
import { GetRoleQueryRepository } from '../../persistence/get-role.query-repository';
import { DeleteRoleCommand } from './delete-role.command';
import { DeleteRoleHandler } from './delete-role.handler';
import { UpdateRoleCommand } from './update-role.command';
import { UpdateRoleHandler } from './update-role.handler';

function createCachedRoleFixture() {
  const role = Role.create('admin').entity;
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
  beforeEach(() => {
    RootEntity.defaultAuthorizer = { can: () => true };
  });

  afterEach(() => {
    RootEntity.defaultAuthorizer = undefined;
  });

  it('hydrates a cached role snapshot before updating it', async () => {
    const { role, cache, findOne, queryRepository } = createCachedRoleFixture();
    const save = vi.fn().mockResolvedValue(undefined);
    const handler = new UpdateRoleHandler(
      queryRepository,
      { save } as never,
      { publishAll: vi.fn() } as never,
    );

    const outcome = await handler.handle(
      new UpdateRoleCommand({ id: role.id, name: 'editor' }),
    );

    expect(outcome.entity).toBeInstanceOf(Role);
    expect(outcome.entity.name).toBe('editor');
    expect(save).toHaveBeenCalledWith(outcome);
    expect(cache.get).toHaveBeenCalledWith(`tenant:role:id:${role.id}`);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('hydrates a cached role snapshot before deleting it', async () => {
    const { role, cache, findOne, queryRepository } = createCachedRoleFixture();
    const save = vi.fn().mockResolvedValue(undefined);
    const handler = new DeleteRoleHandler(
      queryRepository,
      { save } as never,
      { publishAll: vi.fn() } as never,
    );

    const outcome = await handler.handle(
      new DeleteRoleCommand({ id: role.id }),
    );

    expect(outcome.entity).toBeInstanceOf(Role);
    expect(save).toHaveBeenCalledWith(outcome);
    expect(cache.get).toHaveBeenCalledWith(`tenant:role:id:${role.id}`);
    expect(findOne).not.toHaveBeenCalled();
  });
});
