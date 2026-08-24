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
import { FromCache } from './FromCache';

interface GetUserQuery extends IQueryOptions {
  userId: string;
}

class TestQueryRepo {
  public dbFetchCount = 0;

  constructor(public cache?: ICache) { }

  @FromCache<GetUserQuery, { id: string; name: string }>(
    (q) => (q.userId ? `user:${q.userId}` : null),
    (cached: any) => ({ ...cached, hydrated: true }),
  )
  async find(query: GetUserQuery): Promise<{ id: string; name: string }> {
    this.dbFetchCount++;
    return { id: query.userId, name: `User ${query.userId}` };
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
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TestQueryRepo(mockCache);
    const result = await repo.find({ userId: '40' });

    expect(result).toEqual({ id: '40', name: 'User 40' });
    expect(repo.dbFetchCount).toBe(1);
    expect(mockCache.set).toHaveBeenCalledWith('user:40', { id: '40', name: 'User 40' });
  });
});

