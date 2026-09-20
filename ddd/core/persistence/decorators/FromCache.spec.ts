/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IQueryOptions } from '../../application/query.options';
import { MemoryCache } from '../cache/memory.cache';
import type { ICache } from '../cache.interface';
import { createCacheMutationBarrier } from '../helpers/cache-barrier.helper';
import { FromCache, isCacheNewer } from './FromCache';

interface GetUserQuery extends IQueryOptions {
  userId: string;
}

type Row = { id: string; name: string };

/** A real revision-fenced adapter, so the tests exercise the supported path. */
function versionedCache<T>(): MemoryCache<T> {
  return new MemoryCache<T>({ defaultTtlMs: 60_000 });
}

class TestQueryRepo {
  public dbFetchCount = 0;

  constructor(public cache?: ICache) {}

  @FromCache<GetUserQuery, Row>(
    (q) => (q.userId ? `user:${q.userId}` : null),
    (cached: any) => ({ ...cached, hydrated: true }),
  )
  async find(query: GetUserQuery): Promise<Row> {
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
    public cache?: ICache<Row | null>,
    private readonly dbResult: Row | null = null,
  ) {}

  @FromCache<GetUserQuery, Row | null>(
    (q) => `user:${q.userId}`,
    (cached) => {
      if (cached === null) {
        throw new Error('null must not be hydrated');
      }
      return cached as Row;
    },
  )
  async find(_query: GetUserQuery): Promise<Row | null> {
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
    const cache = versionedCache<Row>();
    await cache.set('user:20', { id: '20', name: 'Cached User' });
    const readState = vi.spyOn(cache, 'readState');

    const repo = new TestQueryRepo(cache);
    const result = await repo.find({ userId: '20' });

    expect(result).toEqual({ id: '20', name: 'Cached User' });
    expect(readState).toHaveBeenCalledWith('user:20');
    expect(repo.dbFetchCount).toBe(0);
  });

  it('hydrates cached data when query.hydrate is true and hydrateFn provided', async () => {
    const cache = versionedCache<Row>();
    await cache.set('user:30', { id: '30', name: 'Cached User' });

    const repo = new TestQueryRepo(cache);
    const result = await repo.find({ userId: '30', hydrate: true });

    expect(result).toEqual({ id: '30', name: 'Cached User', hydrated: true });
  });

  it('executes method and fills the cache on a miss', async () => {
    const cache = versionedCache<Row>();
    const tryFill = vi.spyOn(cache, 'tryFill');

    const repo = new TestQueryRepo(cache);
    const result = await repo.find({ userId: '40' });

    expect(result).toEqual({ id: '40', name: 'User 40' });
    expect(repo.dbFetchCount).toBe(1);
    expect(tryFill).toHaveBeenCalledWith(
      'user:40',
      expect.any(String),
      { id: '40', name: 'User 40' },
      expect.any(Object),
    );
    expect(await cache.get('user:40')).toEqual({ id: '40', name: 'User 40' });
  });

  it('returns a cached falsy value without executing the repository method', async () => {
    const cache = versionedCache<boolean>();
    await cache.set('exists:50', false);
    const tryFill = vi.spyOn(cache, 'tryFill');

    const repo = new BooleanQueryRepo(cache);
    const result = await repo.find({ userId: '50' });

    expect(result).toBe(false);
    expect(repo.dbFetchCount).toBe(0);
    expect(tryFill).not.toHaveBeenCalled();
  });

  it('treats a stored null as a miss without hydrating or caching a null result', async () => {
    const cache = versionedCache<Row | null>();
    await cache.set('user:60', null);
    const tryFill = vi.spyOn(cache, 'tryFill');

    const repo = new NullableQueryRepo(cache);
    const result = await repo.find({ userId: '60', hydrate: true });

    expect(result).toBeNull();
    expect(repo.dbFetchCount).toBe(1);
    expect(tryFill).not.toHaveBeenCalled();
  });

  it('replaces a stored null once the backing record exists', async () => {
    const cache = versionedCache<Row | null>();
    await cache.set('user:70', null);
    const persisted = { id: '70', name: 'Created User' };

    const repo = new NullableQueryRepo(cache, persisted);
    const result = await repo.find({ userId: '70', hydrate: true });

    expect(result).toEqual(persisted);
    expect(repo.dbFetchCount).toBe(1);
    expect(await cache.get('user:70')).toEqual(persisted);
  });

  it('treats a mutation barrier as a miss and fills over it with the database result', async () => {
    const cache = versionedCache<unknown>();
    await cache.set(
      'user:u1',
      createCacheMutationBarrier('invalidated', { id: 'u1' }),
    );

    const repo = new TestQueryRepo(cache as ICache);
    const result = await repo.find({ userId: 'u1' });

    expect(repo.dbFetchCount).toBe(1);
    expect(result).toEqual({ id: 'u1', name: 'User u1' });
    expect(await cache.get('user:u1')).toEqual({ id: 'u1', name: 'User u1' });
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

type Versioned = { id: string; version: number };

/**
 * `concurrentWrite` runs between the cache miss and the fill, standing in for
 * another request that commits a newer snapshot while this one reads the
 * database.
 */
class VersionedQueryRepo {
  public dbFetchCount = 0;
  constructor(
    public cache?: ICache,
    private readonly dbResult: Versioned = { id: '1', version: 1 },
    private readonly concurrentWrite?: () => Promise<void>,
  ) {}

  @FromCache<{ userId: string } & IQueryOptions, Versioned>({
    keyFn: (q) => `user:${q.userId}`,
    ttl: 3000,
  })
  async find(_query: { userId: string }): Promise<Versioned> {
    this.dbFetchCount++;
    await this.concurrentWrite?.();
    return this.dbResult;
  }
}

describe('@FromCache with options and concurrency checks', () => {
  it('passes the ttl option to the fill when configured', async () => {
    const cache = versionedCache<Versioned>();
    const tryFill = vi.spyOn(cache, 'tryFill');

    const repo = new VersionedQueryRepo(cache, { id: '80', version: 1 });
    const res = await repo.find({ userId: '80' });

    expect(res).toEqual({ id: '80', version: 1 });
    expect(tryFill).toHaveBeenCalledWith(
      'user:80',
      expect.any(String),
      { id: '80', version: 1 },
      expect.objectContaining({ ttl: 3000 }),
    );
  });

  it('returns the newer snapshot a concurrent writer committed during the database read', async () => {
    const cache = versionedCache<Versioned>();
    const repo = new VersionedQueryRepo(cache, { id: '80', version: 1 }, () =>
      cache.set('user:80', { id: '80', version: 2 }),
    );

    const res = await repo.find({ userId: '80' });

    expect(res).toEqual({ id: '80', version: 2 });
    expect(await cache.get('user:80')).toEqual({ id: '80', version: 2 });
  });

  it('rehydrates the newer concurrent snapshot when alwaysHydrate is true', async () => {
    const cache = versionedCache<Versioned>();

    class HydratedQueryRepo {
      constructor(public cache?: ICache) {}

      @FromCache<
        { userId: string } & IQueryOptions,
        Versioned & { hydrated: boolean }
      >({
        keyFn: (q) => `user:${q.userId}`,
        hydrateFn: (cached: any) => ({ ...cached, hydrated: true }),
        alwaysHydrate: true,
      })
      async find(_query: {
        userId: string;
      }): Promise<Versioned & { hydrated: boolean }> {
        await cache.set('user:80', { id: '80', version: 2 });
        return { id: '80', version: 1, hydrated: true };
      }
    }

    const result = await new HydratedQueryRepo(cache).find({ userId: '80' });

    expect(result).toEqual({ id: '80', version: 2, hydrated: true });
  });

  it('throws TypeError at decoration time when alwaysHydrate is true without hydrateFn', () => {
    expect(() => {
      class InvalidRepo {
        @FromCache({
          keyFn: () => 'key',
          alwaysHydrate: true,
        })
        async find() {}
      }
      return InvalidRepo;
    }).toThrow(new TypeError('FromCache: alwaysHydrate requires a hydrateFn'));
  });

  it('compares the cached snapshot against the serialized one when serializeFn alters structure', async () => {
    class DomainEntity {
      constructor(
        public readonly id: string,
        public readonly sequence: number,
      ) {}
    }

    const cache = versionedCache<unknown>();

    class TransformedRepo {
      constructor(public cache?: ICache) {}

      @FromCache<{ id: string } & IQueryOptions, DomainEntity>({
        keyFn: (q) => `transformed:${q.id}`,
        serializeFn: (entity) => ({ id: entity.id, version: entity.sequence }),
        hydrateFn: (snap: any) => new DomainEntity(snap.id, snap.version),
        alwaysHydrate: true,
      })
      async find(q: { id: string }): Promise<DomainEntity> {
        await cache.set('transformed:t1', { id: 't1', version: 3 });
        return new DomainEntity(q.id, 1);
      }
    }

    const result = await new TransformedRepo(cache as ICache).find({
      id: 't1',
    });

    expect(result).toBeInstanceOf(DomainEntity);
    expect(result.sequence).toBe(3);
  });

  it('extracts the snapshot via toJSON() on a miss', async () => {
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

      @FromCache<{ id: string } & IQueryOptions, EntityResult>({
        keyFn: (q) => `entity:${q.id}`,
      })
      async find(query: { id: string }): Promise<EntityResult> {
        return new EntityResult(query.id, `Entity ${query.id}`);
      }
    }

    const cache = versionedCache<unknown>();
    const result = await new EntityQueryRepo(cache as ICache).find({
      id: '99',
    });

    expect(result).toBeInstanceOf(EntityResult);
    expect(await cache.get('entity:99')).toEqual({
      id: '99',
      name: 'Entity 99',
      isSnapshot: true,
    });
  });

  it('uses a custom serializeFn on a miss when configured', async () => {
    class CustomRepo {
      constructor(public cache?: ICache) {}

      @FromCache<{ id: string } & IQueryOptions, { raw: string }>({
        keyFn: (q) => `custom:${q.id}`,
        serializeFn: (res) => ({ transformed: res.raw.toUpperCase() }),
      })
      async find(_query: { id: string }): Promise<{ raw: string }> {
        return { raw: 'hello' };
      }
    }

    const cache = versionedCache<unknown>();
    const result = await new CustomRepo(cache as ICache).find({ id: '1' });

    expect(result).toEqual({ raw: 'hello' });
    expect(await cache.get('custom:1')).toEqual({ transformed: 'HELLO' });
  });
});

describe('@FromCache with an adapter that exposes only get/set/delete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * A conforming ICache with no revision fence. Its values are pre-seeded so a
   * read, if one happened, would visibly return them.
   */
  function unversionedCache(seed: Record<string, unknown> = {}): ICache {
    const store = new Map<string, unknown>(Object.entries(seed));
    return {
      get: vi.fn(async (key: string) => store.get(key)),
      set: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
    };
  }

  it('bypasses cache reads, so an entry already in the adapter is never served', async () => {
    const cache = unversionedCache({
      'user:20': { id: '20', name: 'Stale Cached User' },
    });

    const repo = new TestQueryRepo(cache);
    const result = await repo.find({ userId: '20' });

    expect(result).toEqual({ id: '20', name: 'User 20' });
    expect(repo.dbFetchCount).toBe(1);
    expect(cache.get).not.toHaveBeenCalled();
  });

  it('bypasses fills, so a stale snapshot can never overwrite a deletion barrier', async () => {
    const cache = unversionedCache();

    const repo = new TestQueryRepo(cache);
    await repo.find({ userId: '40' });

    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.delete).not.toHaveBeenCalled();
  });

  it('reaches the database on every call rather than degrading to a partial cache', async () => {
    const repo = new TestQueryRepo(unversionedCache());

    await repo.find({ userId: '1' });
    await repo.find({ userId: '1' });

    expect(repo.dbFetchCount).toBe(2);
  });

  it('reports the disabled read-through once per adapter instance', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    const cache = unversionedCache();
    const repo = new TestQueryRepo(cache);

    await repo.find({ userId: '1' });
    await repo.find({ userId: '2' });
    await new TestQueryRepo(unversionedCache()).find({ userId: '3' });

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toMatch(/read-through is disabled/);
  });

  it('keeps full caching for an adapter that implements the versioned contract', async () => {
    const cache = versionedCache<Row>();
    const repo = new TestQueryRepo(cache);

    await repo.find({ userId: '1' });
    await repo.find({ userId: '1' });

    expect(repo.dbFetchCount).toBe(1);
  });
});
