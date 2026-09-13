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

  it('does not overwrite cache if cached version is newer than database result (stale read-through)', async () => {
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

    expect(res).toEqual({ id: '80', version: 1 });
    expect(mockCache.set).not.toHaveBeenCalled();
  });
});
