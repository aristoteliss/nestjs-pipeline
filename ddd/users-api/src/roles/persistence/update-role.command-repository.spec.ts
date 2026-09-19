/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import {
  ConcurrencyConflictError,
  EntityNotFoundException,
  type ICache,
  toCacheSnapshot,
} from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { UniqueRoleNameException } from '../domain/models/errors/role-name.exception';
import { Role, type RoleSnapshot } from '../domain/models/role.entity';
import { UpdateRoleCommandRepository } from './update-role.command-repository';

describe('UpdateRoleCommandRepository', () => {
  it('updates role and refreshes cache snapshot by id', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('publisher');
    const nativeUpdate = vi.fn().mockResolvedValue(1);
    const store = {
      get em() {
        return { nativeUpdate, isInTransaction: () => false };
      },
    };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    const result = await pipelineStore.run(
      { tenantId: 'tenant' } as unknown as IPipelineContext,
      () => repository.save(role),
    );

    expect(nativeUpdate).toHaveBeenCalledWith(
      Role,
      { id: role.id, version: 1 },
      { name: 'publisher', updatedAt: role.updatedAt, version: 2 },
    );
    expect(cache.set).toHaveBeenCalledWith(
      `tenant:role:id:${role.id}`,
      toCacheSnapshot(result),
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
    expect(result).toEqual(role.toJSON());
  });

  it('throws EntityNotFoundException when a concurrent delete removed the role', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('publisher');
    const nativeUpdate = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue(null);
    const store = {
      get em() {
        return { nativeUpdate, findOne, isInTransaction: () => false };
      },
    };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toBeInstanceOf(
      EntityNotFoundException,
    );
    expect(findOne).toHaveBeenCalledWith(
      Role,
      { id: role.id },
      { refresh: true },
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('throws ConcurrencyConflictError when the role still exists at a newer version', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('publisher');
    const nativeUpdate = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue({ id: role.id, version: 2 });
    const store = {
      get em() {
        return { nativeUpdate, findOne, isInTransaction: () => false };
      },
    };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow(
      ConcurrencyConflictError,
    );
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('translates unique constraint violations into UniqueRoleNameException', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('admin');
    const store = {
      get em() {
        return {
          isInTransaction: () => false,
          nativeUpdate: vi.fn().mockRejectedValue({
            code: 'SQLITE_CONSTRAINT_UNIQUE',
            message: 'UNIQUE constraint failed: roles.name',
          }),
        };
      },
    };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    await expect(repository.save(role)).rejects.toThrow(
      UniqueRoleNameException,
    );
    expect(role.getExpectedVersion()).toBe(1);
  });

  it('advances expectedVersion baseline allowing successive mutations and saves on the same role instance', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('publisher'); // version 2, expected 1
    const nativeUpdate = vi.fn().mockResolvedValue(1);
    const store = {
      get em() {
        return { nativeUpdate, isInTransaction: () => false };
      },
    };
    const repository = new UpdateRoleCommandRepository(cache, store as never);

    await repository.save(role);
    expect(role.getExpectedVersion()).toBe(2);

    // Second mutation on the same in-memory instance
    role.rename('author'); // version 3, expected 2
    await repository.save(role);

    expect(nativeUpdate).toHaveBeenLastCalledWith(
      Role,
      { id: role.id, version: 2 },
      { name: 'author', updatedAt: role.updatedAt, version: 3 },
    );
    expect(role.getExpectedVersion()).toBe(3);
  });
});

/** These tests exercise the decorated lifecycle through the concrete repository API. */
describe('decorated versioned update lifecycle', () => {
  function setup() {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const em = {
      isInTransaction: vi.fn().mockReturnValue(false),
      nativeUpdate: vi.fn().mockResolvedValue(1),
      findOne: vi.fn(),
    };
    const role = Role.create('editor');
    role.rename('publisher');
    return {
      cache,
      em,
      role,
      repository: new UpdateRoleCommandRepository(cache, { em } as never),
    };
  }

  it('acknowledges and caches only the version written when mutated during the write', async () => {
    const { cache, em, role, repository } = setup();
    const written = role.toJSON();
    em.nativeUpdate.mockImplementation(async () => {
      role.rename('reviewer');
      return 1;
    });
    const result = await pipelineStore.run(
      { tenantId: 'tenant' } as unknown as IPipelineContext,
      () => repository.save(role),
    );
    expect(role.version).toBe(3);
    expect(role.getExpectedVersion()).toBe(2);
    expect(result).toEqual(written);
    expect(cache.set).toHaveBeenCalledWith(
      expect.any(String),
      toCacheSnapshot(written),
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
  });

  it('does not turn cache failure into failed persistence or undo acknowledgment', async () => {
    const { cache, role, repository } = setup();
    vi.mocked(cache.set).mockRejectedValue(new Error('cache unavailable'));
    await expect(repository.save(role)).resolves.toEqual(role.toJSON());
    expect(role.getExpectedVersion()).toBe(2);
  });

  it('rejects an outer transaction before SQL, acknowledgment, or caching', async () => {
    const { cache, em, role, repository } = setup();
    em.isInTransaction.mockReturnValue(true);
    await expect(repository.save(role)).rejects.toThrow(
      'external transactions need commit hooks',
    );
    expect(em.nativeUpdate).not.toHaveBeenCalled();
    expect(role.getExpectedVersion()).toBe(1);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it.each([
    { code: '23505', constraint: 'roles_name_unique' },
    new Error(
      'insert - duplicate key value violates unique constraint "roles_name_unique"',
    ),
    new Error(
      'update - SQLITE_CONSTRAINT: UNIQUE constraint failed: roles.name',
    ),
  ])('maps an identified role-name constraint: %s', async (error) => {
    const { cache, em, role, repository } = setup();
    em.nativeUpdate.mockRejectedValue(error);
    await expect(repository.save(role)).rejects.toBeInstanceOf(
      UniqueRoleNameException,
    );
    expect(role.getExpectedVersion()).toBe(1);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it.each([
    new Error('unique application failure'),
    { code: 'SQLITE_CONSTRAINT_UNIQUE' },
    { code: '23505', constraint: 'roles_other_unique' },
    new Error('UNIQUE constraint failed: roles.other'),
    new Error('UNIQUE constraint failed: roles.name, roles.other'),
  ])('preserves unrelated or unidentified failures: %s', async (error) => {
    const { cache, em, role, repository } = setup();
    em.nativeUpdate.mockRejectedValue(error);
    await expect(repository.save(role)).rejects.toBe(error);
    expect(role.getExpectedVersion()).toBe(1);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('loads authoritative snapshots through the write-side reader', async () => {
    const { em, role, repository } = setup();
    em.findOne.mockResolvedValue(role);
    const result = await repository.findById(role.id);
    expect(result).toBeInstanceOf(Role);
    expect(result?.id).toBe(role.id);
    expect(em.findOne).toHaveBeenCalledWith(
      Role,
      { id: role.id },
      { refresh: true },
    );
  });
});
