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
import { RootDomainOutcome } from '../../domain/outcomes/root-domain.outcome';
import type { ICache } from '../cache.interface';
import { Cache } from './Cache';

class MockOutcome extends RootDomainOutcome<{ cacheKey: string; id: string }> {
  constructor(entity: { cacheKey: string; id: string }) {
    super(entity);
  }
}

class TestCommandRepo {
  constructor(public cache?: ICache) { }

  @Cache()
  async save(outcome: MockOutcome): Promise<{ id: string } | null> {
    if (outcome.entity.id === 'delete-me') {
      return null;
    }
    return { id: outcome.entity.id };
  }
}

describe('@Cache decorator on CommandRepository.save', () => {
  it('passes through when repository has no cache attached', async () => {
    const repo = new TestCommandRepo(undefined);
    const outcome = new MockOutcome({ id: 'u1', cacheKey: 'user:u1' });

    const result = await repo.save(outcome);
    expect(result).toEqual({ id: 'u1' });
  });

  it('writes saved entity result to cache using outcome entity cacheKey', async () => {
    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TestCommandRepo(mockCache);
    const outcome = new MockOutcome({ id: 'u1', cacheKey: 'user:u1' });

    const result = await repo.save(outcome);

    expect(result).toEqual({ id: 'u1' });
    expect(mockCache.set).toHaveBeenCalledWith('user:u1', { id: 'u1' });
  });

  it('evicts cache key when save returns null (e.g. deletion)', async () => {
    const mockCache: ICache = {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
    };

    const repo = new TestCommandRepo(mockCache);
    const outcome = new MockOutcome({ id: 'delete-me', cacheKey: 'user:delete-me' });

    const result = await repo.save(outcome);

    expect(result).toBeNull();
    expect(mockCache.delete).toHaveBeenCalledWith('user:delete-me');
    expect(mockCache.set).not.toHaveBeenCalled();
  });
});

