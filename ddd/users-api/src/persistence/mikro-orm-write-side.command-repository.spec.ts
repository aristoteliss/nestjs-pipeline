/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { ICache } from '@nestjs-pipeline/ddd-core/application';
import { describe, expect, it, vi } from 'vitest';
import { User, type UserSnapshot } from '../users/domain/models/user.entity';
import { TransientOperationError } from './is-transient-persistence-error';
import { MikroOrmWriteSideCommandRepository } from './mikro-orm-write-side.command-repository';

class TestWriteSideRepository extends MikroOrmWriteSideCommandRepository<
  UserSnapshot,
  User,
  UserSnapshot
> {
  async save(_entity: User): Promise<UserSnapshot | null> {
    return null;
  }
}

describe('MikroOrmWriteSideCommandRepository', () => {
  it('loads authoritative snapshot using refresh: true', async () => {
    const user = User.create('Alice', 'alice@example.test');
    const findOne = vi.fn().mockResolvedValue(user);
    const store = {
      get em() {
        return { findOne };
      },
    };
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repository = new TestWriteSideRepository(
      cache,
      store as never,
      User,
      'User',
      User.fromJSON,
    );

    const result = await repository.findById(user.id);

    expect(findOne).toHaveBeenCalledWith(
      User,
      { id: user.id },
      { refresh: true },
    );
    expect(result).toBeInstanceOf(User);
    expect(result?.id).toBe(user.id);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('returns null when aggregate is not found', async () => {
    const findOne = vi.fn().mockResolvedValue(null);
    const store = {
      get em() {
        return { findOne };
      },
    };
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repository = new TestWriteSideRepository(
      cache,
      store as never,
      User,
      'User',
      User.fromJSON,
    );

    const result = await repository.findById('missing-id');

    expect(result).toBeNull();
    expect(findOne).toHaveBeenCalledWith(
      User,
      { id: 'missing-id' },
      { refresh: true },
    );
  });

  it('translates transient database errors via mapPersistenceError', async () => {
    const findOne = vi.fn().mockRejectedValue({
      code: '08006', // Connection failure in PostgreSQL
      message: 'connection failure',
    });
    const store = {
      get em() {
        return { findOne };
      },
    };
    const cache: ICache<UserSnapshot> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repository = new TestWriteSideRepository(
      cache,
      store as never,
      User,
      'User',
      User.fromJSON,
    );

    await expect(repository.findById('err-id')).rejects.toThrow(
      TransientOperationError,
    );
  });
});
