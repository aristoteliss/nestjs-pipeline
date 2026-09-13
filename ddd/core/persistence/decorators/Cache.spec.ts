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
    expect(mockCache.set).toHaveBeenCalledWith(
      'mock:u1',
      { id: 'u1' },
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
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
    expect(mockCache.set).toHaveBeenCalledWith(
      'mock:u1',
      false,
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
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
    expect(cache.set).toHaveBeenCalledWith(
      'user:u1',
      { id: 'u1' },
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
    expect(vi.mocked(cache.delete).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(cache.set).mock.invocationCallOrder[0],
    );
  });

  it('does not fail save if deleteKeys or invalidateKeys callbacks throw', async () => {
    class FailingCallbacksRepo {
      constructor(public cache?: ICache) {}

      @Cache<MockEntity, { id: string } | null>({
        setKey: () => 'mock:key',
        invalidateKeys: () => {
          throw new Error('Explosion in invalidateKeys');
        },
        deleteKeys: () => {
          throw new Error('Explosion in deleteKeys');
        },
      })
      async save(entity: MockEntity): Promise<{ id: string } | null> {
        if (entity.id === 'del') {
          return null;
        }
        return { id: entity.id };
      }
    }

    const cache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new FailingCallbacksRepo(cache);

    // Save success case when invalidateKeys throws
    const saveResult = await repo.save({ id: 'ok' });
    expect(saveResult).toEqual({ id: 'ok' });

    // Save deletion case when deleteKeys throws
    const delResult = await repo.save({ id: 'del' });
    expect(delResult).toBeNull();
  });

  it('does not fail save if setKey callback throws', async () => {
    class FailingSetKeyRepo {
      constructor(public cache?: ICache) {}

      @Cache<MockEntity, { id: string }>({
        setKey: () => {
          throw new Error('Explosion in setKey');
        },
      })
      async save(entity: MockEntity): Promise<{ id: string }> {
        return { id: entity.id };
      }
    }

    const cache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new FailingSetKeyRepo(cache);

    const result = await repo.save({ id: 'ok' });
    expect(result).toEqual({ id: 'ok' });
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('passes configured ttl and custom isNewer options to cache.set', async () => {
    const customIsNewer = vi.fn().mockReturnValue(true);
    class OptionsRepo {
      constructor(public cache?: ICache) {}

      @Cache<MockEntity, { id: string }>({
        setKey: (entity) => `opt:${entity.id}`,
        ttl: 5000,
        isNewer: customIsNewer,
      })
      async save(entity: MockEntity): Promise<{ id: string }> {
        return { id: entity.id };
      }
    }

    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new OptionsRepo(mockCache);
    await repo.save({ id: 'item1' });

    expect(mockCache.set).toHaveBeenCalledWith(
      'opt:item1',
      { id: 'item1' },
      {
        ttl: 5000,
        isNewer: customIsNewer,
      },
    );
  });

  it('converts live entity to snapshot via toJSON() before caching', async () => {
    class LiveUser {
      constructor(
        public readonly id: string,
        public readonly name: string,
      ) {}

      toJSON() {
        return { id: this.id, name: this.name, isSnapshot: true };
      }
    }

    class AggregateRepo {
      constructor(public cache?: ICache) {}

      @Cache<LiveUser, LiveUser>((user) => `user:${user.id}`)
      async save(user: LiveUser): Promise<LiveUser> {
        return user;
      }
    }

    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new AggregateRepo(mockCache);
    const liveUser = new LiveUser('u123', 'Alice');
    const result = await repo.save(liveUser);

    expect(result).toBe(liveUser);
    expect(mockCache.set).toHaveBeenCalledWith(
      'user:u123',
      { id: 'u123', name: 'Alice', isSnapshot: true },
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
  });

  it('prevents older write-through from overwriting newer cached version (CAS protection)', async () => {
    // Simulated stateful cache implementing isNewer CAS logic
    const store = new Map<string, unknown>();
    const casCache: ICache = {
      get: vi.fn(async (key: string) => store.get(key)),
      set: vi.fn(async (key: string, value: unknown, options) => {
        const existing = store.get(key);
        if (existing && options?.isNewer?.(existing, value)) {
          return; // Skip stale write
        }
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    };

    interface VersionedEntity {
      id: string;
      version: number;
    }

    class VersionedEntityRepo {
      constructor(public cache?: ICache) {}

      @Cache<VersionedEntity, { id: string; version: number }>(
        (e) => `entity:${e.id}`,
      )
      async save(
        entity: VersionedEntity,
      ): Promise<{ id: string; version: number }> {
        return { id: entity.id, version: entity.version };
      }
    }

    const repo = new VersionedEntityRepo(casCache);

    // Initial write at version 1
    await repo.save({ id: 'e1', version: 1 });
    expect(store.get('entity:e1')).toEqual({ id: 'e1', version: 1 });

    // Command B commits and caches version 3
    await repo.save({ id: 'e1', version: 3 });
    expect(store.get('entity:e1')).toEqual({ id: 'e1', version: 3 });

    // Command A delayed write-through completes with version 2
    await repo.save({ id: 'e1', version: 2 });

    // The cache MUST NOT have been overwritten by stale version 2; it stays version 3!
    expect(store.get('entity:e1')).toEqual({ id: 'e1', version: 3 });
  });
});
