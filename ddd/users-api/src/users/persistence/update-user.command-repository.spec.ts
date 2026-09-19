/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import {
  ConcurrencyConflictError,
  DEFAULT_BARRIER_TTL_MS,
  EntityNotFoundException,
  type ICache,
  toCacheSnapshot,
} from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import { UpdateUserCommandRepository } from './update-user.command-repository';

describe('UpdateUserCommandRepository', () => {
  it('writes the database before best-effort email invalidation and id refresh', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn().mockRejectedValue(new Error('cache set failed')),
      delete: vi.fn().mockRejectedValue(new Error('cache delete failed')),
    };
    const user = User.create('Alice', 'alice@example.test');
    user.update({ username: 'Alicia' });
    const nativeUpdate = vi.fn().mockResolvedValue(1);
    const store = {
      get em() {
        return { nativeUpdate };
      },
    };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    await expect(
      pipelineStore.run(
        { tenantId: 'tenant' } as unknown as IPipelineContext,
        () => repository.save(user),
      ),
    ).resolves.toEqual(user.toJSON());
    expect(nativeUpdate).toHaveBeenCalledWith(
      User,
      { id: user.id, version: 1 },
      {
        username: 'Alicia',
        department: null,
        updatedAt: user.updatedAt,
        version: 2,
      },
    );
    expect(cache.set).toHaveBeenCalledWith(
      'tenant:user:email:alice@example.test',
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'invalidated',
      }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
    expect(cache.set).toHaveBeenCalledWith(
      `tenant:user:id:${user.id}`,
      toCacheSnapshot(user.toJSON()),
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('throws EntityNotFoundException when a concurrent delete removed the user', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test');
    const nativeUpdate = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue(null);
    const store = {
      get em() {
        return { nativeUpdate, findOne };
      },
    };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    user.update({ username: 'Alicia' });
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

  it('throws ConcurrencyConflictError when the user still exists at a newer version', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test');
    const nativeUpdate = vi.fn().mockResolvedValue(0);
    const findOne = vi.fn().mockResolvedValue({ id: user.id, version: 2 });
    const store = {
      get em() {
        return { nativeUpdate, findOne };
      },
    };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    user.update({ username: 'Alicia' });
    await expect(repository.save(user)).rejects.toThrow(
      ConcurrencyConflictError,
    );
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not touch cache when the database update fails', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test');
    const failure = new Error('database failed');
    const nativeUpdate = vi.fn().mockRejectedValue(failure);
    const store = {
      get em() {
        return { nativeUpdate };
      },
    };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    user.update({ username: 'Alicia' });
    await expect(repository.save(user)).rejects.toBe(failure);
    expect(cache.delete).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(user.getExpectedVersion()).toBe(1);
  });

  it('advances expectedVersion baseline allowing successive mutations and saves on the same instance', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test');
    user.update({ username: 'Alicia' }); // version becomes 2, expected is 1
    const nativeUpdate = vi.fn().mockResolvedValue(1);
    const store = {
      get em() {
        return { nativeUpdate };
      },
    };
    const repository = new UpdateUserCommandRepository(cache, store as never);

    await repository.save(user);
    expect(user.getExpectedVersion()).toBe(2);

    // Second mutation on the same in-memory instance
    user.update({ username: 'Alicia II' }); // version becomes 3, expected is 2
    await repository.save(user);

    expect(nativeUpdate).toHaveBeenLastCalledWith(
      User,
      { id: user.id, version: 2 },
      {
        username: 'Alicia II',
        department: null,
        updatedAt: user.updatedAt,
        version: 3,
      },
    );
    expect(user.getExpectedVersion()).toBe(3);
  });
});
