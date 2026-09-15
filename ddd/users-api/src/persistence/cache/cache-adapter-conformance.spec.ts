/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache, MemoryCache } from '@nestjs-pipeline/ddd-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User, UserSnapshot } from '../../users/domain/models/user.entity';
import { CacheEntry } from './cache.entity';
import { MikroOrmCache } from './mikro-orm.cache';

/**
 * Creates a stateful in-memory store simulating MikroORM CacheEntry storage.
 */
function createStatefulMikroOrmStore(): any {
  const table = new Map<string, CacheEntry>();

  const em = {
    findOne: vi.fn().mockImplementation(async (_entity, where) => {
      const entry = table.get(where.key);
      if (!entry) return null;
      // Return a copy to mimic database row hydration
      const copy = new CacheEntry();
      copy.key = entry.key;
      copy.value = entry.value;
      copy.expiresAt = entry.expiresAt;
      return copy;
    }),
    upsert: vi.fn().mockImplementation(async (_entity, data) => {
      const entry = new CacheEntry();
      entry.key = data.key;
      entry.value = data.value;
      entry.expiresAt = data.expiresAt ?? null;
      table.set(data.key, entry);
    }),
    nativeUpdate: vi.fn().mockImplementation(async (_entity, where, data) => {
      const entry = table.get(where.key);
      if (!entry) return 0;
      if (where.value !== undefined && entry.value !== where.value) return 0;
      entry.value = data.value;
      if (data.expiresAt !== undefined) entry.expiresAt = data.expiresAt;
      return 1;
    }),
    nativeDelete: vi.fn().mockImplementation(async (_entity, where) => {
      const entry = table.get(where.key);
      if (!entry) return 0;
      if (where.value !== undefined && entry.value !== where.value) return 0;
      if (where.expiresAt !== undefined && entry.expiresAt !== where.expiresAt)
        return 0;
      table.delete(where.key);
      return 1;
    }),
  };

  return {
    em,
    transactional: vi.fn().mockImplementation(async (cb) => cb(em)),
  };
}

describe('Cache Adapter Conformance (MemoryCache & MikroOrmCache)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const adapters: Array<{
    name: string;
    factory: (defaultTtlMs?: number) => ICache<any>;
  }> = [
    {
      name: 'MemoryCache',
      factory: (defaultTtlMs) => new MemoryCache({ defaultTtlMs }),
    },
    {
      name: 'MikroOrmCache',
      factory: (defaultTtlMs) =>
        new MikroOrmCache(createStatefulMikroOrmStore(), { defaultTtlMs }),
    },
  ];

  describe.each(adapters)('$name Conformance', ({ factory }) => {
    it('returns undefined on cache miss', async () => {
      const cache = factory();
      expect(await cache.get('missing-key')).toBeUndefined();
    });

    it('stores and retrieves plain values before TTL expires', async () => {
      const cache = factory(10_000);
      await cache.set('k1', { id: '1', name: 'Alice' });

      const result = await cache.get('k1');
      expect(result).toEqual({ id: '1', name: 'Alice' });
    });

    it('expires and purges entries after TTL has elapsed', async () => {
      const cache = factory(5_000);
      await cache.set('k-ttl', { id: 'expired' });

      vi.advanceTimersByTime(5_001);

      expect(await cache.get('k-ttl')).toBeUndefined();
    });

    it('supports explicit deletion of cached keys', async () => {
      const cache = factory();
      await cache.set('k-del', { id: 'deleted' });
      await cache.delete('k-del');

      expect(await cache.get('k-del')).toBeUndefined();
    });

    it('enforces stale-write protection via isNewer', async () => {
      const cache = factory();
      await cache.set('ver:1', { id: '1', version: 2 });

      // Stale write attempt (version 1 <= version 2)
      await cache.set(
        'ver:1',
        { id: '1', version: 1 },
        {
          isNewer: (cached, incoming) =>
            (cached as any).version > (incoming as any).version,
        },
      );

      expect(await cache.get('ver:1')).toEqual({ id: '1', version: 2 });

      // Newer write attempt (version 3 > version 2)
      await cache.set(
        'ver:1',
        { id: '1', version: 3 },
        {
          isNewer: (cached, incoming) =>
            (cached as any).version > (incoming as any).version,
        },
      );

      expect(await cache.get('ver:1')).toEqual({ id: '1', version: 3 });
    });

    it('enforces ownership isolation: mutating object after set() does not mutate cache', async () => {
      const cache = factory();
      const input = { id: '10', name: 'Original', meta: { score: 100 } };

      await cache.set('iso:set', input);

      // Caller mutates the source object
      input.name = 'Mutated';
      input.meta.score = 999;

      const cached = await cache.get('iso:set');
      expect(cached).toEqual({
        id: '10',
        name: 'Original',
        meta: { score: 100 },
      });
    });

    it('enforces ownership isolation: mutating object after get() does not mutate cache for next caller', async () => {
      const cache = factory();
      await cache.set('iso:get', {
        id: '20',
        name: 'Original',
        tags: ['alpha'],
      });

      const firstGet = await cache.get('iso:get');
      firstGet.name = 'MutatedFromGet';
      firstGet.tags.push('injected');

      const secondGet = await cache.get('iso:get');
      expect(secondGet).toEqual({
        id: '20',
        name: 'Original',
        tags: ['alpha'],
      });
    });

    it('serializes Date properties to ISO strings across cache boundary', async () => {
      const cache = factory();
      const date = new Date('2026-09-13T18:00:00.000Z');

      await cache.set('date:test', {
        id: '30',
        createdAt: date,
        updatedAt: date,
      });

      const cached = await cache.get('date:test');
      expect(typeof cached.createdAt).toBe('string');
      expect(cached.createdAt).toBe('2026-09-13T18:00:00.000Z');
      expect(typeof cached.updatedAt).toBe('string');
      expect(cached.updatedAt).toBe('2026-09-13T18:00:00.000Z');
    });

    it('restores domain Date instances and prototype when rehydrated via User.fromJSON()', async () => {
      const cache = factory();
      const user = User.create('BobSmith', 'bob@example.test', 'engineering');
      const snapshot = user.toJSON();

      await cache.set(`user:${user.id}`, snapshot);

      const cachedSnapshot = (await cache.get(
        `user:${user.id}`,
      )) as UserSnapshot;

      // Rehydrate into aggregate
      const rehydrated = User.fromJSON(cachedSnapshot);

      expect(rehydrated).toBeInstanceOf(User);
      expect(rehydrated.id).toBe(user.id);
      expect(rehydrated.username).toBe('BobSmith');
      expect(rehydrated.email).toBe('bob@example.test');
      expect(rehydrated.department).toBe('engineering');
      expect(rehydrated.createdAt).toBeInstanceOf(Date);
      expect(rehydrated.createdAt.getTime()).toBe(user.createdAt.getTime());
      expect(rehydrated.updatedAt).toBeInstanceOf(Date);
      expect(rehydrated.updatedAt.getTime()).toBe(user.updatedAt.getTime());
      expect(rehydrated.getExpectedVersion()).toBe(user.getExpectedVersion());
    });
  });
});
