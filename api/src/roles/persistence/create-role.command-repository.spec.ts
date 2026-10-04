/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { type ICache } from '@cqrs-ddd/core/application';
import {
  cacheKey,
  setPersistenceDialect,
  toCacheSnapshot,
} from '@cqrs-ddd/core/persistence';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception.js';
import { Role, type RoleSnapshot } from '../domain/models/role.entity.js';
import { CreateRoleCommandRepository } from './create-role.command-repository.js';

/** Reports the `name` constraint for `taken`, as the MikroORM dialect does for a real violation. */
const taken = new Error('name already taken');
function useFakeDialect() {
  beforeAll(() =>
    setPersistenceDialect({
      uniqueViolation: (error) => (error === taken ? 'name' : undefined),
    }),
  );
  afterAll(() => setPersistenceDialect(undefined));
}

describe('CreateRoleCommandRepository', () => {
  useFakeDialect();

  it('persists role, acknowledges, and caches snapshot by id', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    const upsert = vi.fn().mockResolvedValue(role);
    const store = {
      get em() {
        return { upsert, isInTransaction: () => false };
      },
    };
    const repository = new CreateRoleCommandRepository(cache, store as never);

    const result = await runWithTenant('tenant', () => repository.save(role));

    const idKey = cacheKey(Role.aggregateName, { id: role.id }, 'tenant');
    const nameKey = cacheKey(Role.aggregateName, { name: role.name }, 'tenant');
    expect(upsert).toHaveBeenCalledWith(Role, role);
    expect(cache.set).toHaveBeenCalledWith(
      idKey,
      toCacheSnapshot(result),
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
    expect(cache.set).toHaveBeenCalledWith(
      nameKey,
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'invalidated',
      }),
      expect.objectContaining({ ttl: expect.any(Number) }),
    );
    expect(result).toEqual(role.toJSON());
    expect((role as any)._persistedVersion).toBe(1);
  });

  it('translates a violation of the name constraint into UniqueRoleNameException', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    const store = {
      get em() {
        return {
          upsert: vi.fn().mockRejectedValue(taken),
          isInTransaction: () => false,
        };
      },
    };
    const repository = new CreateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow(
      UniqueRoleNameException,
    );
  });

  it('rethrows unrelated error unchanged without acknowledging version', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('editor-updated');
    const store = {
      get em() {
        return {
          upsert: vi.fn().mockRejectedValue(new Error('Database timeout')),
          isInTransaction: () => false,
        };
      },
    };
    const repository = new CreateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow('Database timeout');
    expect((role as any)._persistedVersion).toBe(1);
  });
});
