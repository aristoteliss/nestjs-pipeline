/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type ICache, runWithTenant } from '@cqrs-ddd/core/application';
import {
  ConcurrencyConflictError,
  EntityNotFoundException,
  TransientOperationError,
} from '@cqrs-ddd/core/domain';
import {
  DEFAULT_BARRIER_TTL_MS,
  filterCacheKey,
} from '@cqrs-ddd/core/persistence';
import { describe, expect, it, vi } from 'vitest';
import { Role, type RoleSnapshot } from '../domain/models/role.entity';
import { DeleteRoleCommandRepository } from './delete-role.command-repository';

describe('DeleteRoleCommandRepository', () => {
  it('evicts the tenant-aware query key and never caches the delete count', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const nativeDelete = vi.fn().mockResolvedValue(1);
    const store = {
      get em() {
        return { nativeDelete };
      },
    };
    const repository = new DeleteRoleCommandRepository(cache, store as never);
    const role = Role.create('admin');

    role.delete();
    const result = await runWithTenant('tenant', () => repository.save(role));

    const idKey = filterCacheKey(Role.aggregateName, { id: role.id }, 'tenant');
    const nameKey = filterCacheKey(
      Role.aggregateName,
      { name: role.name },
      'tenant',
    );
    expect(result).toBeNull();
    expect(nativeDelete).toHaveBeenCalledWith(Role, {
      id: role.id,
      version: role.getExpectedVersion(),
    });
    expect(cache.set).toHaveBeenCalledWith(
      idKey,
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'deleted',
      }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
    expect(cache.set).toHaveBeenCalledWith(
      nameKey,
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'deleted',
      }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('throws ConcurrencyConflictError when the role exists at a newer version and does not evict cache', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('admin');
    const nativeDelete = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue({ id: role.id, version: 2 });
    const store = {
      get em() {
        return { nativeDelete, findOne };
      },
    };
    const repository = new DeleteRoleCommandRepository(cache, store as never);

    role.delete();
    await expect(repository.save(role)).rejects.toThrow(
      ConcurrencyConflictError,
    );
    expect(findOne).toHaveBeenCalledWith(
      Role,
      { id: role.id },
      { refresh: true },
    );
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('throws EntityNotFoundException when a concurrent delete already removed the role and does not evict cache', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const role = Role.create('admin');
    const nativeDelete = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue(null);
    const store = {
      get em() {
        return { nativeDelete, findOne };
      },
    };
    const repository = new DeleteRoleCommandRepository(cache, store as never);

    role.delete();
    await expect(repository.save(role)).rejects.toBeInstanceOf(
      EntityNotFoundException,
    );
    expect(findOne).toHaveBeenCalledWith(
      Role,
      { id: role.id },
      { refresh: true },
    );
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('translates transient database failures into TransientOperationError', async () => {
    const cache: ICache<RoleSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const transientError = Object.assign(new Error('deadlock detected'), {
      code: '40P01',
    });
    const nativeDelete = vi.fn().mockRejectedValue(transientError);
    const store = {
      get em() {
        return { nativeDelete };
      },
    };
    const repository = new DeleteRoleCommandRepository(cache, store as never);
    const role = Role.create('admin');
    role.delete();

    await expect(repository.save(role)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof TransientOperationError &&
        (err as Error & { cause?: unknown }).cause === transientError,
    );
  });
});
