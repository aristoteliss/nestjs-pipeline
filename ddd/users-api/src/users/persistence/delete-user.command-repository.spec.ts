/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { type ICache } from '@nestjs-pipeline/ddd-core/application';
import {
  ConcurrencyConflictError,
  EntityNotFoundException,
  TransientOperationError,
} from '@nestjs-pipeline/ddd-core/domain';
import {
  DEFAULT_BARRIER_TTL_MS,
  filterCacheKey,
} from '@nestjs-pipeline/ddd-core/persistence';
import { describe, expect, it, vi } from 'vitest';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import { DeleteUserCommandRepository } from './delete-user.command-repository';

describe('DeleteUserCommandRepository', () => {
  it('deletes user entity directly relying on ON DELETE CASCADE and evicts tenant-aware keys', async () => {
    const cache: ICache<UserSnapshot> = {
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
    const repository = new DeleteUserCommandRepository(cache, store as never);
    const user = User.create('Alice', 'alice@example.test', 'engineering');

    user.delete();
    const result = await pipelineStore.run(
      { tenantId: 'tenant' } as unknown as IPipelineContext,
      () => repository.save(user),
    );

    expect(result).toBeNull();
    expect(nativeDelete).toHaveBeenCalledWith(User, {
      id: user.id,
      version: user.getExpectedVersion(),
    });
    const idKey = filterCacheKey(User.aggregateName, { id: user.id }, 'tenant');
    const emailKey = filterCacheKey(
      User.aggregateName,
      { email: 'alice@example.test' },
      'tenant',
    );
    expect(cache.set).toHaveBeenCalledWith(
      idKey,
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'deleted',
      }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
    expect(cache.set).toHaveBeenCalledWith(
      emailKey,
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'deleted',
      }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('throws ConcurrencyConflictError when the user exists at a newer version and does not evict cache', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test');
    const nativeDelete = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue({ id: user.id, version: 2 });
    const store = {
      get em() {
        return { nativeDelete, findOne };
      },
    };
    const repository = new DeleteUserCommandRepository(cache, store as never);

    user.delete();
    await expect(repository.save(user)).rejects.toThrow(
      ConcurrencyConflictError,
    );
    expect(findOne).toHaveBeenCalledWith(
      User,
      { id: user.id },
      { refresh: true },
    );
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('throws EntityNotFoundException when a concurrent delete already removed the user and does not evict cache', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test');
    const nativeDelete = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue(null);
    const store = {
      get em() {
        return { nativeDelete, findOne };
      },
    };
    const repository = new DeleteUserCommandRepository(cache, store as never);

    user.delete();
    await expect(repository.save(user)).rejects.toBeInstanceOf(
      EntityNotFoundException,
    );
    expect(findOne).toHaveBeenCalledWith(
      User,
      { id: user.id },
      { refresh: true },
    );
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not evict cache when the database delete fails', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const failure = new Error('delete failed');
    const nativeDelete = vi.fn().mockRejectedValue(failure);
    const store = {
      get em() {
        return { nativeDelete };
      },
    };
    const repository = new DeleteUserCommandRepository(cache, store as never);
    const user = User.create('Alice', 'alice@example.test');
    user.delete();

    await expect(repository.save(user)).rejects.toBe(failure);

    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('translates transient database failures into TransientOperationError', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const transientError = Object.assign(new Error('serialization failure'), {
      code: '40001',
    });
    const nativeDelete = vi.fn().mockRejectedValue(transientError);
    const store = {
      get em() {
        return { nativeDelete };
      },
    };
    const repository = new DeleteUserCommandRepository(cache, store as never);
    const user = User.create('Alice', 'alice@example.test');
    user.delete();

    await expect(repository.save(user)).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof TransientOperationError &&
        (err as Error & { cause?: unknown }).cause === transientError,
    );
  });
});

describe('DeleteUserCommandRepository transaction boundary', () => {
  const cache = (): ICache<UserSnapshot> => ({
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  });

  it('rejects an externally active transaction before deleting or evicting', async () => {
    const entries = cache();
    const nativeDelete = vi.fn().mockResolvedValue(1);
    const store = {
      get em() {
        return { nativeDelete, isInTransaction: () => true, findOne: vi.fn() };
      },
    };
    const repository = new DeleteUserCommandRepository(entries, store as never);
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    user.delete();

    await expect(
      pipelineStore.run(
        { tenantId: 'tenant' } as unknown as IPipelineContext,
        () => repository.save(user),
      ),
    ).rejects.toThrow(/requires autocommit/);

    expect(nativeDelete).not.toHaveBeenCalled();
    expect(entries.delete).not.toHaveBeenCalled();
    expect(entries.set).not.toHaveBeenCalled();
  });

  it('leaves the persisted version baseline untouched when the delete is rejected', async () => {
    const store = {
      get em() {
        return {
          nativeDelete: vi.fn().mockResolvedValue(1),
          isInTransaction: () => true,
          findOne: vi.fn(),
        };
      },
    };
    const repository = new DeleteUserCommandRepository(cache(), store as never);
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    user.delete();
    const expectedBefore = user.getExpectedVersion();

    await expect(
      pipelineStore.run(
        { tenantId: 'tenant' } as unknown as IPipelineContext,
        () => repository.save(user),
      ),
    ).rejects.toThrow();

    expect(user.getExpectedVersion()).toBe(expectedBefore);
  });
});
