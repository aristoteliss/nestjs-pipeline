/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { type ICache } from '@cqrs-ddd/core/application';
import {
  cacheKey,
  DEFAULT_BARRIER_TTL_MS,
  setPersistenceDialect,
  toCacheSnapshot,
} from '@cqrs-ddd/core/persistence';
import { runWithTenant } from '@cqrs-ddd/pipeline-tenant';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { UniqueEmailException } from '../domain/models/errors/email.exception.js';
import { User, type UserSnapshot } from '../domain/models/user.entity.js';
import { CreateUserCommandRepository } from './create-user.command-repository.js';

/** Reports the `email` constraint for `taken`, as the MikroORM dialect does for a real violation. */
const taken = new Error('email already taken');
function useFakeDialect() {
  beforeAll(() =>
    setPersistenceDialect({
      uniqueViolation: (error) => (error === taken ? 'email' : undefined),
    }),
  );
  afterAll(() => setPersistenceDialect(undefined));
}

describe('CreateUserCommandRepository', () => {
  useFakeDialect();

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
        return { create, persist, flush, isInTransaction: () => false };
      },
    };
    const repository = new CreateUserCommandRepository(cache, store as never);

    const result = await runWithTenant('tenant', () => repository.save(user));

    const idKey = cacheKey(User.aggregateName, { id: user.id }, 'tenant');
    const emailKey = cacheKey(
      User.aggregateName,
      { email: 'alice@example.test' },
      'tenant',
    );

    expect(cache.set).toHaveBeenCalledWith(
      idKey,
      toCacheSnapshot(result),
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
    expect(cache.set).toHaveBeenCalledWith(
      emailKey,
      expect.objectContaining({
        __cacheBarrier: true,
        reason: 'invalidated',
      }),
      { ttl: DEFAULT_BARRIER_TTL_MS },
    );
    expect(cache.delete).not.toHaveBeenCalled();
    expect((user as any)._persistedVersion).toBe(1);
  });

  it('translates a violation of the email constraint into UniqueEmailException', async () => {
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
          flush: vi.fn().mockRejectedValue(taken),
          isInTransaction: () => false,
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
          isInTransaction: () => false,
        };
      },
    };
    const repository = new CreateUserCommandRepository(cache, store as never);
    await expect(repository.save(user)).rejects.toThrow('Connection lost');
    expect((user as any)._persistedVersion).toBe(1);
  });
});

describe('CreateUserCommandRepository transaction boundary', () => {
  useFakeDialect();

  it('rejects an externally active transaction before persisting or flushing', async () => {
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const create = vi.fn();
    const persist = vi.fn();
    const flush = vi.fn();
    const store = {
      get em() {
        return { create, persist, flush, isInTransaction: () => true };
      },
    };
    const repository = new CreateUserCommandRepository(cache, store as never);
    const user = User.create('Alice', 'alice@example.test', 'engineering');
    const expectedBefore = user.getExpectedVersion();

    await expect(
      runWithTenant('tenant', () => repository.save(user)),
    ).rejects.toThrow(/requires autocommit/);

    expect(create).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(flush).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(user.getExpectedVersion()).toBe(expectedBefore);
  });
});
