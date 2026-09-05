/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { describe, expect, it, vi } from 'vitest';
import type { ICache } from '../cache.interface';
import { Cache } from './Cache';

interface MockEntity {
  id: string;
}

class TestCommandRepo {
  constructor(public cache?: ICache) {}

  @Cache<MockEntity, { id: string }>({
    setKey: (entity) => `mock:${entity.id}`,
    deleteKeys: (entity) => [`mock:${entity.id}`],
  })
  async save(entity: MockEntity): Promise<{ id: string } | null> {
    if (entity.id === 'delete-me') {
      return null;
    }
    return { id: entity.id };
  }
}

class BooleanCommandRepo {
  constructor(public cache?: ICache) {}

  @Cache<MockEntity, boolean>((entity) => `mock:${entity.id}`)
  async save(_entity: MockEntity): Promise<boolean | null> {
    return false;
  }
}

class VoidCommandRepo {
  constructor(public cache?: ICache<void>) {}

  @Cache<MockEntity, void>({
    deleteKeys: (entity) => [`mock:${entity.id}`],
  })
  async save(_entity: MockEntity): Promise<void> {}
}

class SecondaryInvalidationRepo {
  constructor(public cache?: ICache) {}

  @Cache<MockEntity, { id: string }>(
    (entity) => `user:${entity.id}`,
    null,
    (entity) => [`email:${entity.id}`],
  )
  async save(entity: MockEntity): Promise<{ id: string }> {
    return { id: entity.id };
  }
}

describe('@Cache decorator on CommandRepository.save', () => {
  it('throws an error if instantiated without any key derivation function', () => {
    expect(() => {
      Cache(null, null, null);
    }).toThrow(
      '@Cache decorator requires at least one of setKey, deleteKeys, or invalidateKeys to be specified.',
    );
  });

  it('passes through when repository has no cache attached', async () => {
    const repo = new TestCommandRepo(undefined);
    const entity: MockEntity = { id: 'u1' };

    const result = await repo.save(entity);
    expect(result).toEqual({ id: 'u1' });
  });

  it('writes saved entity result to cache using entity id', async () => {
    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TestCommandRepo(mockCache);
    const entity: MockEntity = { id: 'u1' };

    const result = await repo.save(entity);

    expect(result).toEqual({ id: 'u1' });
    expect(mockCache.set).toHaveBeenCalledWith('mock:u1', { id: 'u1' });
  });

  it('evicts cache key when save returns null (e.g. deletion)', async () => {
    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TestCommandRepo(mockCache);
    const entity: MockEntity = {
      id: 'delete-me',
    };

    const result = await repo.save(entity);

    expect(result).toBeNull();
    expect(mockCache.delete).toHaveBeenCalledWith('mock:delete-me');
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('caches and returns a valid falsy result instead of treating it as deletion', async () => {
    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new BooleanCommandRepo(mockCache);
    const entity: MockEntity = { id: 'u1' };

    const result = await repo.save(entity);

    expect(result).toBe(false);
    expect(mockCache.set).toHaveBeenCalledWith('mock:u1', false);
    expect(mockCache.delete).not.toHaveBeenCalled();
  });

  it('evicts instead of caching undefined for a void save', async () => {
    const mockCache: ICache<void> = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new VoidCommandRepo(mockCache);
    const entity: MockEntity = { id: 'u1' };

    const result = await repo.save(entity);

    expect(result).toBeUndefined();
    expect(mockCache.delete).toHaveBeenCalledWith('mock:u1');
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('evicts secondary keys after a successful save before caching the result', async () => {
    const cache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new SecondaryInvalidationRepo(cache);
    const entity: MockEntity = { id: 'u1' };

    await repo.save(entity);

    expect(cache.delete).toHaveBeenCalledWith('email:u1');
    expect(cache.set).toHaveBeenCalledWith('user:u1', { id: 'u1' });
    expect(vi.mocked(cache.delete).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(cache.set).mock.invocationCallOrder[0],
    );
  });
});
