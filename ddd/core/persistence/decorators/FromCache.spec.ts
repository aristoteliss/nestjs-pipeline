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
import type { IQueryOptions } from '../../application/query.options';
import type { ICache } from '../cache.interface';
import { createCacheMutationBarrier } from '../helpers/cache-barrier.helper';
import { FromCache, isCacheNewer } from './FromCache';

interface GetUserQuery extends IQueryOptions {
  userId: string;
}

class TestQueryRepo {
  public dbFetchCount = 0;

  constructor(public cache?: ICache) {}

  @FromCache<GetUserQuery, { id: string; name: string }>(
    (q) => (q.userId ? `user:${q.userId}` : null),
    (cached: any) => ({ ...cached, hydrated: true }),
  )
  async find(query: GetUserQuery): Promise<{ id: string; name: string }> {
    this.dbFetchCount++;
    return { id: query.userId, name: `User ${query.userId}` };
  }
}

class BooleanQueryRepo {
  public dbFetchCount = 0;

  constructor(public cache?: ICache<boolean>) {}

  @FromCache<GetUserQuery, boolean>((q) => `exists:${q.userId}`)
  async find(_query: GetUserQuery): Promise<boolean> {
    this.dbFetchCount++;
    return true;
  }
}

class NullableQueryRepo {
  public dbFetchCount = 0;

  constructor(
    public cache?: ICache<{ id: string; name: string } | null>,
    private readonly dbResult: { id: string; name: string } | null = null,
  ) {}

  @FromCache<GetUserQuery, { id: string; name: string } | null>(
    (q) => `user:${q.userId}`,
    (cached) => {
      if (cached === null) {
        throw new Error('null must not be hydrated');
      }
      return cached as { id: string; name: string };
    },
  )
  async find(
    _query: GetUserQuery,
  ): Promise<{ id: string; name: string } | null> {
    this.dbFetchCount++;
    return this.dbResult;
  }
}

describe('@FromCache decorator on QueryRepository.find', () => {
  it('passes through and fetches directly when repository has no cache', async () => {
    const repo = new TestQueryRepo(undefined);
    const result = await repo.find({ userId: '10' });

    expect(result).toEqual({ id: '10', name: 'User 10' });
    expect(repo.dbFetchCount).toBe(1);
  });

  it('serves from cache on cache hit', async () => {
    const cachedData = { id: '20', name: 'Cached User' };
    const mockCache: ICache = {
      get: vi.fn().mockResolvedValue(cachedData),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TestQueryRepo(mockCache);
    const result = await repo.find({ userId: '20' });

    expect(result).toEqual(cachedData);
    expect(mockCache.get).toHaveBeenCalledWith('user:20');
    expect(repo.dbFetchCount).toBe(0);
  });

  it('hydrates cached data when query.hydrate is true and hydrateFn provided', async () => {
    const cachedData = { id: '30', name: 'Cached User' };
    const mockCache: ICache = {
      get: vi.fn().mockResolvedValue(cachedData),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TestQueryRepo(mockCache);
    const result = await repo.find({ userId: '30', hydrate: true });

    expect(result).toEqual({ id: '30', name: 'Cached User', hydrated: true });
  });

  it('executes method and caches result on cache miss', async () => {
    const mockCache: ICache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TestQueryRepo(mockCache);
    const result = await repo.find({ userId: '40' });

    expect(result).toEqual({ id: '40', name: 'User 40' });
    expect(repo.dbFetchCount).toBe(1);
    expect(mockCache.set).toHaveBeenCalledWith(
      'user:40',
      { id: '40', name: 'User 40' },
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
  });

  it('returns a cached falsy value without executing the repository method', async () => {
    const mockCache: ICache<boolean> = {
      get: vi.fn().mockResolvedValue(false),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new BooleanQueryRepo(mockCache);

    const result = await repo.find({ userId: '50' });

    expect(result).toBe(false);
    expect(repo.dbFetchCount).toBe(0);
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('treats cached null as a miss without hydrating or caching a null result', async () => {
    const mockCache: ICache<{ id: string; name: string } | null> = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new NullableQueryRepo(mockCache);

    const result = await repo.find({ userId: '60', hydrate: true });

    expect(result).toBeNull();
    expect(repo.dbFetchCount).toBe(1);
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('replaces a legacy cached null after the backing record is created', async () => {
    const mockCache: ICache<{ id: string; name: string } | null> = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const persisted = { id: '70', name: 'Created User' };
    const repo = new NullableQueryRepo(mockCache, persisted);

    const result = await repo.find({ userId: '70', hydrate: true });

    expect(result).toEqual(persisted);
    expect(repo.dbFetchCount).toBe(1);
    expect(mockCache.set).toHaveBeenCalledWith(
      'user:70',
      persisted,
      expect.objectContaining({ isNewer: expect.any(Function) }),
    );
  });
});

describe('isCacheNewer helper', () => {
  it('correctly compares version numbers', () => {
    expect(isCacheNewer({ version: 2 }, { version: 1 })).toBe(true);
    expect(isCacheNewer({ version: 1 }, { version: 2 })).toBe(false);
    expect(isCacheNewer({ version: 1 }, { version: 1 })).toBe(false);
  });

  it('correctly compares __gen numbers', () => {
    expect(isCacheNewer({ __gen: 5 }, { __gen: 4 })).toBe(true);
    expect(isCacheNewer({ __gen: 4 }, { __gen: 5 })).toBe(false);
  });

  it('correctly compares updatedAt timestamps', () => {
    const older = new Date('2026-01-01T00:00:00Z');
    const newer = new Date('2026-01-02T00:00:00Z');
    expect(isCacheNewer({ updatedAt: newer }, { updatedAt: older })).toBe(true);
    expect(isCacheNewer({ updatedAt: older }, { updatedAt: newer })).toBe(
      false,
    );
    expect(
      isCacheNewer(
        { updatedAt: '2026-01-02T00:00:00Z' },
        { updatedAt: '2026-01-01T00:00:00Z' },
      ),
    ).toBe(true);
  });

  it('returns false for primitives or missing fields', () => {
    expect(isCacheNewer(null, { version: 1 })).toBe(false);
    expect(isCacheNewer('str', { version: 1 })).toBe(false);
    expect(isCacheNewer({ other: 1 }, { other: 2 })).toBe(false);
  });
});

class VersionedQueryRepo {
  public dbFetchCount = 0;
  constructor(
    public cache?: ICache,
    private readonly dbResult: { id: string; version: number } = {
      id: '1',
      version: 1,
    },
  ) {}

  @FromCache<{ userId: string }, { id: string; version: number }>({
    keyFn: (q) => `user:${q.userId}`,
    ttl: 3000,
  })
  async find(_query: {
    userId: string;
  }): Promise<{ id: string; version: number }> {
    this.dbFetchCount++;
    return this.dbResult;
  }
}

describe('@FromCache with options and concurrency checks', () => {
  it('passes ttl option to cache.set when configured', async () => {
    const mockCache: ICache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new VersionedQueryRepo(mockCache, { id: '80', version: 1 });
    const res = await repo.find({ userId: '80' });

    expect(res).toEqual({ id: '80', version: 1 });
    expect(mockCache.set).toHaveBeenCalledWith(
      'user:80',
      { id: '80', version: 1 },
      expect.objectContaining({ ttl: 3000, isNewer: expect.any(Function) }),
    );
  });

  it('returns newer cached version when concurrent write occurred during database fetch (strong consistency)', async () => {
    const mockCache: ICache = {
      get: vi
        .fn()
        .mockResolvedValueOnce(undefined) // first call in decorator: cache miss
        .mockResolvedValueOnce({ id: '80', version: 2 }), // second call before write: concurrent write happened
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new VersionedQueryRepo(mockCache, { id: '80', version: 1 });
    const res = await repo.find({ userId: '80' });

    // Strong consistency: caller receives the fresher version 2, and cache is NOT overwritten with stale version 1
    expect(res).toEqual({ id: '80', version: 2 });
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('rehydrates newer cached snapshot when concurrent write occurs and alwaysHydrate is true', async () => {
    class HydratedQueryRepo {
      constructor(public cache?: ICache) {}

      @FromCache<
        { userId: string },
        { id: string; version: number; hydrated: boolean }
      >({
        keyFn: (q) => `user:${q.userId}`,
        hydrateFn: (cached: any) => ({ ...cached, hydrated: true }),
        alwaysHydrate: true,
      })
      async find(_query: {
        userId: string;
      }): Promise<{ id: string; version: number; hydrated: boolean }> {
        return { id: '80', version: 1, hydrated: true };
      }
    }

    const mockCache: ICache = {
      get: vi
        .fn()
        .mockResolvedValueOnce(undefined) // cache miss
        .mockResolvedValueOnce({ id: '80', version: 2 }), // concurrent write v2
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new HydratedQueryRepo(mockCache);
    const result = await repo.find({ userId: '80' });

    expect(result).toEqual({ id: '80', version: 2, hydrated: true });
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('throws TypeError at decoration time when alwaysHydrate is true without hydrateFn', () => {
    expect(() => {
      class _InvalidRepo {
        @FromCache({
          keyFn: () => 'key',
          alwaysHydrate: true,
        })
        async find() {}
      }
    }).toThrow(new TypeError('FromCache: alwaysHydrate requires a hydrateFn'));
  });

  it('compares cached snapshot against incoming snapshot when serializeFn alters structure', async () => {
    class DomainEntity {
      constructor(
        public readonly id: string,
        public readonly sequence: number,
      ) {}
    }

    class TransformedRepo {
      constructor(public cache?: ICache) {}

      @FromCache<{ id: string }, DomainEntity>({
        keyFn: (q) => `transformed:${q.id}`,
        serializeFn: (entity) => ({ id: entity.id, version: entity.sequence }),
        hydrateFn: (snap: any) => new DomainEntity(snap.id, snap.version),
        alwaysHydrate: true,
      })
      async find(q: { id: string }): Promise<DomainEntity> {
        return new DomainEntity(q.id, 1);
      }
    }

    const mockCache: ICache = {
      get: vi
        .fn()
        .mockResolvedValueOnce(undefined) // cache miss
        .mockResolvedValueOnce({ id: 't1', version: 3 }), // concurrent cached snapshot with version 3
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TransformedRepo(mockCache);
    const result = await repo.find({ id: 't1' });

    // Comparison compared cached snapshot (version 3) with serialized snapshot (version 1)
    expect(result).toBeInstanceOf(DomainEntity);
    expect(result.sequence).toBe(3);
    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('automatically extracts snapshot via toJSON() on cache miss', async () => {
    class EntityResult {
      constructor(
        public readonly id: string,
        public readonly name: string,
      ) {}
      toJSON() {
        return { id: this.id, name: this.name, isSnapshot: true };
      }
    }

    class EntityQueryRepo {
      constructor(public cache?: ICache) {}

      @FromCache<{ id: string }, EntityResult>({
        keyFn: (q) => `entity:${q.id}`,
      })
      async find(query: { id: string }): Promise<EntityResult> {
        return new EntityResult(query.id, `Entity ${query.id}`);
      }
    }

    const mockCache: ICache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new EntityQueryRepo(mockCache);
    const result = await repo.find({ id: '99' });

    expect(result).toBeInstanceOf(EntityResult);
    expect(mockCache.set).toHaveBeenCalledWith(
      'entity:99',
      { id: '99', name: 'Entity 99', isSnapshot: true },
      expect.any(Object),
    );
  });

  it('uses custom serializeFn on cache miss when configured', async () => {
    class CustomRepo {
      constructor(public cache?: ICache) {}

      @FromCache<{ id: string }, { raw: string }>({
        keyFn: (q) => `custom:${q.id}`,
        serializeFn: (res) => ({ transformed: res.raw.toUpperCase() }),
      })
      async find(_query: { id: string }): Promise<{ raw: string }> {
        return { raw: 'hello' };
      }
    }

    const mockCache: ICache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(),
      delete: vi.fn(),
    };
    const repo = new CustomRepo(mockCache);
    const result = await repo.find({ id: '1' });

    expect(result).toEqual({ raw: 'hello' });
    expect(mockCache.set).toHaveBeenCalledWith(
      'custom:1',
      { transformed: 'HELLO' },
      expect.any(Object),
    );
  });

  describe('Mutation Barrier Protocol (Anti-Resurrection)', () => {
    it('bypasses existing barrier on initial check and replaces it with fresh DB snapshot', async () => {
      const barrier = createCacheMutationBarrier('invalidated', { id: 'u1' });
      const cacheMap = new Map<string, any>();
      cacheMap.set('user:u1', barrier);

      const mockCache: ICache = {
        get: vi
          .fn()
          .mockImplementation(async (key: string) => cacheMap.get(key)),
        set: vi.fn().mockImplementation(async (key: string, val: any) => {
          cacheMap.set(key, val);
        }),
        delete: vi.fn().mockImplementation(async (key: string) => {
          cacheMap.delete(key);
        }),
      };

      const repo = new TestQueryRepo(mockCache);
      const result = await repo.find({ userId: 'u1' });

      expect(repo.dbFetchCount).toBe(1);
      expect(result).toEqual({ id: 'u1', name: 'User u1' });
      expect(mockCache.set).toHaveBeenCalledWith(
        'user:u1',
        { id: 'u1', name: 'User u1' },
        expect.any(Object),
      );
      expect(cacheMap.get('user:u1')).toEqual({ id: 'u1', name: 'User u1' });
    });

    it('retries when delete barrier appears during DB read and does not cache stale snapshot if DB returns null', async () => {
      let cacheValue: any;

      const mockCache: ICache = {
        get: vi.fn().mockImplementation(async () => cacheValue),
        set: vi.fn().mockImplementation(async (_key, val) => {
          cacheValue = val;
        }),
        delete: vi.fn(),
      };

      class DeletableQueryRepo {
        public dbFetchCount = 0;
        constructor(public cache?: ICache) {}

        @FromCache<GetUserQuery, { id: string; name: string } | null>(
          (q) => `user:${q.userId}`,
          (cached: any) => cached,
        )
        async find(
          query: GetUserQuery,
        ): Promise<{ id: string; name: string } | null> {
          this.dbFetchCount++;
          if (this.dbFetchCount === 1) {
            // Simulate concurrent delete while DB query was in-flight
            cacheValue = createCacheMutationBarrier('deleted', {
              id: query.userId,
            });
            return { id: query.userId, name: 'Stale User' };
          }
          // Second call (retry) finds entity deleted in DB
          return null;
        }
      }

      const repo = new DeletableQueryRepo(mockCache);
      const result = await repo.find({ userId: 'u1' });

      expect(result).toBeNull();
      expect(repo.dbFetchCount).toBe(2);
      // Stale snapshot must NEVER have been written to cache
      expect(mockCache.set).not.toHaveBeenCalled();
      // Barrier remains in cache
      expect(cacheValue.__cacheBarrier).toBe(true);
    });

    it('retries when invalidation barrier appears during DB read and caches fresh v2 result', async () => {
      let cacheValue: any;

      const mockCache: ICache = {
        get: vi.fn().mockImplementation(async () => cacheValue),
        set: vi.fn().mockImplementation(async (_key, val) => {
          cacheValue = val;
        }),
        delete: vi.fn(),
      };

      class VersionedQueryRepo {
        public dbFetchCount = 0;
        constructor(public cache?: ICache) {}

        @FromCache<GetUserQuery, { id: string; version: number }>(
          (q) => `user:${q.userId}`,
          (c: any) => c,
        )
        async find(
          query: GetUserQuery,
        ): Promise<{ id: string; version: number }> {
          this.dbFetchCount++;
          if (this.dbFetchCount === 1) {
            // Mutation barrier occurs during v1 read
            cacheValue = createCacheMutationBarrier('invalidated', {
              id: query.userId,
            });
            return { id: query.userId, version: 1 };
          }
          // Second attempt reads authoritative v2
          return { id: query.userId, version: 2 };
        }
      }

      const repo = new VersionedQueryRepo(mockCache);
      const result = await repo.find({ userId: 'u1' });

      expect(result).toEqual({ id: 'u1', version: 2 });
      expect(repo.dbFetchCount).toBe(2);
      expect(mockCache.set).toHaveBeenCalledWith(
        'user:u1',
        { id: 'u1', version: 2 },
        expect.any(Object),
      );
    });

    it('handles concurrent create where DB returns null but post-DB check sees committed snapshot', async () => {
      let cacheValue: any;

      const mockCache: ICache = {
        get: vi.fn().mockImplementation(async () => cacheValue),
        set: vi.fn().mockImplementation(async (_key, val) => {
          cacheValue = val;
        }),
        delete: vi.fn(),
      };

      class CreateRaceRepo {
        public dbFetchCount = 0;
        constructor(public cache?: ICache) {}

        @FromCache<GetUserQuery, { id: string; name: string } | null>({
          keyFn: (q) => `user:${q.userId}`,
          alwaysHydrate: true,
          hydrateFn: (c: any) => ({ ...c, hydrated: true }),
        })
        async find(
          query: GetUserQuery,
        ): Promise<{ id: string; name: string } | null> {
          this.dbFetchCount++;
          // Concurrently, a creator commits and puts snapshot in cache
          cacheValue = { id: query.userId, name: 'Created User', version: 1 };
          // But our read started before commit and returned null
          return null;
        }
      }

      const repo = new CreateRaceRepo(mockCache);
      const result = await repo.find({ userId: 'u1' });

      expect(repo.dbFetchCount).toBe(1);
      expect(result).toEqual({
        id: 'u1',
        name: 'Created User',
        version: 1,
        hydrated: true,
      });
      // Cache was NOT overwritten with null
      expect(mockCache.set).not.toHaveBeenCalled();
    });

    it('rejects stale read when ABA mutation barrier token changes between initial and post-DB checks', async () => {
      const b1 = createCacheMutationBarrier('deleted', { id: 'u1' });
      const b2 = createCacheMutationBarrier('invalidated', { id: 'u1' });
      let cacheValue: any = b1;

      const mockCache: ICache = {
        get: vi.fn().mockImplementation(async () => cacheValue),
        set: vi.fn().mockImplementation(async (_key, val) => {
          cacheValue = val;
        }),
        delete: vi.fn(),
      };

      class AbaQueryRepo {
        public dbFetchCount = 0;
        constructor(public cache?: ICache) {}

        @FromCache<GetUserQuery, { id: string; version: number }>(
          (q) => `user:${q.userId}`,
          (c: any) => c,
        )
        async find(
          query: GetUserQuery,
        ): Promise<{ id: string; version: number }> {
          this.dbFetchCount++;
          if (this.dbFetchCount === 1) {
            // While DB read is running, ABA occurs: cache barrier changes to b2
            cacheValue = b2;
            return { id: query.userId, version: 1 };
          }
          return { id: query.userId, version: 2 };
        }
      }

      const repo = new AbaQueryRepo(mockCache);
      const result = await repo.find({ userId: 'u1' });

      expect(repo.dbFetchCount).toBe(2);
      expect(result).toEqual({ id: 'u1', version: 2 });
    });

    it('terminates bounded retries and returns DB result without caching when barriers mutate continuously', async () => {
      const mockCache: ICache = {
        get: vi.fn().mockImplementation(async () => {
          // Generate a new barrier token on every get call
          return createCacheMutationBarrier('invalidated', { id: 'u1' });
        }),
        set: vi.fn(),
        delete: vi.fn(),
      };

      class FastMutationRepo {
        public dbFetchCount = 0;
        constructor(public cache?: ICache) {}

        @FromCache<GetUserQuery, { id: string; version: number }>(
          (q) => `user:${q.userId}`,
          (c: any) => c,
        )
        async find(
          query: GetUserQuery,
        ): Promise<{ id: string; version: number }> {
          this.dbFetchCount++;
          return { id: query.userId, version: this.dbFetchCount };
        }
      }

      const repo = new FastMutationRepo(mockCache);
      const result = await repo.find({ userId: 'u1' });

      // MAX_BARRIER_RETRIES = 2 -> attempts 0, 1, 2 -> 3 db fetches total
      expect(repo.dbFetchCount).toBe(3);
      // Returns final DB result
      expect(result).toEqual({ id: 'u1', version: 3 });
      // Does NOT write to cache because barrier was active and changing
      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });
});
