/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { type ICache, toCacheSnapshot } from '@nestjs-pipeline/ddd-core';
import { describe, expect, it, vi } from 'vitest';
import { UniqueEmailException } from '../domain/models/errors/email.exception';
import { User, type UserSnapshot } from '../domain/models/user.entity';
import { CreateUserCommandRepository } from './create-user.command-repository';

describe('CreateUserCommandRepository', () => {
  it('persists, acknowledges, caches by id, and invalidates the secondary email lookup', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    const create = vi.fn().mockReturnValue(user);
    const persist = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    const store = {
      get em() {
        return { create, persist, flush };
      },
    };
    const repository = new CreateUserCommandRepository(cache, store as never);

    const result = await repository.save(user);

    expect(cache.set).toHaveBeenCalledWith(
      `tenant:user:id:${user.id}`,
      toCacheSnapshot(result),
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
    expect(cache.set).toHaveBeenCalledWith(
      'tenant:user:email:alice@example.test',
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'invalidated',
      }),
      { ttl: 0 },
    );
    expect(cache.delete).not.toHaveBeenCalled();
    expect((user as any)._persistedVersion).toBe(1);
  });

  it('translates PostgreSQL unique constraint violation into UniqueEmailException', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    const store = {
      get em() {
        return {
          create: vi.fn().mockReturnValue(user),
          persist: vi.fn(),
          flush: vi.fn().mockRejectedValue({
            code: '23505',
            constraint: 'users_email_unique',
          }),
        };
      },
    };
    const repository = new CreateUserCommandRepository(cache, store as never);
    await expect(repository.save(user)).rejects.toThrow(UniqueEmailException);
  });

  it('translates SQLite unique constraint violation into UniqueEmailException', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    const store = {
      get em() {
        return {
          create: vi.fn().mockReturnValue(user),
          persist: vi.fn(),
          flush: vi
            .fn()
            .mockRejectedValue(
              new Error(
                'SQLITE_CONSTRAINT: UNIQUE constraint failed: users.email',
              ),
            ),
        };
      },
    };
    const repository = new CreateUserCommandRepository(cache, store as never);
    await expect(repository.save(user)).rejects.toThrow(UniqueEmailException);
  });

  it('rethrows unrelated database error unchanged without acknowledging version', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    user.update({ username: 'AliceModified' });
    const store = {
      get em() {
        return {
          create: vi.fn().mockReturnValue(user),
          persist: vi.fn(),
          flush: vi.fn().mockRejectedValue(new Error('Connection lost')),
        };
      },
    };
    const repository = new CreateUserCommandRepository(cache, store as never);
    await expect(repository.save(user)).rejects.toThrow('Connection lost');
    expect((user as any)._persistedVersion).toBe(1);
  });
});
