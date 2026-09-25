/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { type ICache, runWithTenant } from '@cqrs-ddd/core/application';
import { filterCacheKey, toCacheSnapshot } from '@cqrs-ddd/core/persistence';
import { describe, expect, it, vi } from 'vitest';
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception';
import { Role, type RoleSnapshot } from '../domain/models/role.entity';
import { CreateRoleCommandRepository } from './create-role.command-repository';

describe('CreateRoleCommandRepository', () => {
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
        return { upsert };
      },
    };
    const repository = new CreateRoleCommandRepository(cache, store as never);

    const result = await runWithTenant('tenant', () => repository.save(role));

    const idKey = filterCacheKey(Role.aggregateName, { id: role.id }, 'tenant');
    const nameKey = filterCacheKey(
      Role.aggregateName,
      { name: role.name },
      'tenant',
    );
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

  it('translates PostgreSQL unique constraint violation into UniqueRoleNameException', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    const store = {
      get em() {
        return {
          upsert: vi.fn().mockRejectedValue({
            code: '23505',
            constraint: 'roles_name_unique',
          }),
        };
      },
    };
    const repository = new CreateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow(
      UniqueRoleNameException,
    );
  });

  it('translates SQLite unique constraint violation into UniqueRoleNameException', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    const store = {
      get em() {
        return {
          upsert: vi
            .fn()
            .mockRejectedValue(
              new Error(
                'SQLITE_CONSTRAINT: UNIQUE constraint failed: roles.name',
              ),
            ),
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
        };
      },
    };
    const repository = new CreateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow('Database timeout');
    expect((role as any)._persistedVersion).toBe(1);
  });
});
