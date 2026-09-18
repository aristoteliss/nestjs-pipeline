/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { OptimisticLockError } from '@mikro-orm/core';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import {
  EntityNotFoundException,
  type ICache,
  TransientOperationError,
} from '@nestjs-pipeline/ddd-core';
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
    expect(cache.set).toHaveBeenCalledWith(
      `tenant:user:id:${user.id}`,
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'deleted',
      }),
      { ttl: 0 },
    );
    expect(cache.set).toHaveBeenCalledWith(
      'tenant:user:email:alice@example.test',
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'deleted',
      }),
      { ttl: 0 },
    );
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('throws OptimisticLockError when the user exists at a newer version and does not evict cache', async () => {
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
    await expect(repository.save(user)).rejects.toThrow(OptimisticLockError);
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
