/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { CacheEntry } from './cache.entity';
import { MikroOrmCache } from './mikro-orm.cache';

describe('MikroOrmCache', () => {
  it('stores value with default 60s TTL when no options provided', async () => {
    let upserted: any = null;
    const mockEm: any = {
      upsert: vi.fn().mockImplementation(async (_entity, data) => {
        upserted = data;
      }),
    };
    const mockStore: any = {
      em: mockEm,
    };

    const cache = new MikroOrmCache<{ name: string }>(mockStore);
    const before = Date.now();
    await cache.set('key1', { name: 'Alice' });
    const after = Date.now();

    expect(mockEm.upsert).toHaveBeenCalled();
    expect(upserted.key).toBe('key1');
    expect(JSON.parse(upserted.value)).toEqual({ name: 'Alice' });
    expect(upserted.expiresAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(upserted.expiresAt).toBeLessThanOrEqual(after + 60_000);
  });

  it('stores value with custom TTL when specified in options', async () => {
    let upserted: any = null;
    const mockEm: any = {
      upsert: vi.fn().mockImplementation(async (_entity, data) => {
        upserted = data;
      }),
    };
    const mockStore: any = {
      em: mockEm,
    };

    const cache = new MikroOrmCache<{ name: string }>(mockStore);
    const before = Date.now();
    await cache.set('key1', { name: 'Alice' }, { ttl: 5_000 });
    const after = Date.now();

    expect(upserted.expiresAt).toBeGreaterThanOrEqual(before + 5_000);
    expect(upserted.expiresAt).toBeLessThanOrEqual(after + 5_000);
  });

  it('evicts and returns undefined on get when entry is expired', async () => {
    const expiredEntry = new CacheEntry();
    expiredEntry.key = 'expired-key';
    expiredEntry.value = JSON.stringify({ name: 'Old' });
    expiredEntry.expiresAt = Date.now() - 1000;

    const mockEm: any = {
      findOne: vi.fn().mockResolvedValue(expiredEntry),
      nativeDelete: vi.fn().mockResolvedValue(1),
    };
    const mockStore: any = {
      em: mockEm,
    };

    const cache = new MikroOrmCache(mockStore);
    const result = await cache.get('expired-key');

    expect(result).toBeUndefined();
    expect(mockEm.findOne).toHaveBeenCalledWith(
      CacheEntry,
      { key: 'expired-key' },
      { disableIdentityMap: true },
    );
    expect(mockEm.nativeDelete).toHaveBeenCalledWith(CacheEntry, {
      key: 'expired-key',
      value: expiredEntry.value,
      expiresAt: expiredEntry.expiresAt,
    });
  });

  it('bypasses identity map and returns parsed value on cache hit', async () => {
    const liveEntry = new CacheEntry();
    liveEntry.key = 'live-key';
    liveEntry.value = JSON.stringify({ name: 'Live', score: 100 });
    liveEntry.expiresAt = Date.now() + 60_000;

    const mockEm: any = {
      findOne: vi.fn().mockResolvedValue(liveEntry),
    };
    const mockStore: any = { em: mockEm };

    const cache = new MikroOrmCache<{ name: string; score: number }>(mockStore);
    const result = await cache.get('live-key');

    expect(result).toEqual({ name: 'Live', score: 100 });
    expect(mockEm.findOne).toHaveBeenCalledWith(
      CacheEntry,
      { key: 'live-key' },
      { disableIdentityMap: true },
    );
  });

  it('re-reads and returns fresh replacement when concurrent write raced during lazy eviction', async () => {
    const expiredEntry = new CacheEntry();
    expiredEntry.key = 'race-key';
    expiredEntry.value = JSON.stringify({ version: 1 });
    expiredEntry.expiresAt = Date.now() - 1000;

    const freshEntry = new CacheEntry();
    freshEntry.key = 'race-key';
    freshEntry.value = JSON.stringify({ version: 2 });
    freshEntry.expiresAt = Date.now() + 60_000;

    const mockEm: any = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce(expiredEntry) // first read finds expired entry
        .mockResolvedValueOnce(freshEntry), // re-read after affected === 0 finds fresh entry
      nativeDelete: vi.fn().mockResolvedValue(0), // nativeDelete affects 0 rows because fresh write altered value/expiresAt
    };
    const mockStore: any = { em: mockEm };

    const cache = new MikroOrmCache<{ version: number }>(mockStore);
    const result = await cache.get('race-key');

    // Reader did NOT delete fresh entry, lost CAS delete, re-read and returned fresh value
    expect(result).toEqual({ version: 2 });
    expect(mockEm.nativeDelete).toHaveBeenCalledWith(CacheEntry, {
      key: 'race-key',
      value: expiredEntry.value,
      expiresAt: expiredEntry.expiresAt,
    });
    expect(mockEm.findOne).toHaveBeenCalledTimes(2);
  });

  it('throws and fails closed when cached JSON payload is corrupt', async () => {
    const corruptEntry = new CacheEntry();
    corruptEntry.key = 'corrupt-key';
    corruptEntry.value = 'invalid-json{{{';
    corruptEntry.expiresAt = Date.now() + 60_000;

    const mockEm: any = {
      findOne: vi.fn().mockResolvedValue(corruptEntry),
    };
    const mockStore: any = { em: mockEm };

    const cache = new MikroOrmCache(mockStore);
    await expect(cache.get('corrupt-key')).rejects.toThrow(SyntaxError);
  });

  it('rejects stale write atomically when isNewer indicates cached entry is newer', async () => {
    const cachedEntry = new CacheEntry();
    cachedEntry.key = 'user:1';
    cachedEntry.value = JSON.stringify({ id: '1', version: 2 });
    cachedEntry.expiresAt = Date.now() + 60_000;

    const transactionalEm: any = {
      findOne: vi.fn().mockResolvedValue(cachedEntry),
      upsert: vi.fn(),
    };

    const mockStore: any = {
      em: {},
      transactional: vi.fn().mockImplementation(async (cb) => {
        return cb(transactionalEm);
      }),
    };

    const cache = new MikroOrmCache<{ id: string; version: number }>(mockStore);
    await cache.set(
      'user:1',
      { id: '1', version: 1 },
      {
        isNewer: (cached, incoming) =>
          (cached as any).version > (incoming as any).version,
      },
    );

    expect(mockStore.transactional).toHaveBeenCalled();
    expect(transactionalEm.findOne).toHaveBeenCalledWith(
      CacheEntry,
      {
        key: 'user:1',
      },
      { refresh: true },
    );
    expect(transactionalEm.upsert).not.toHaveBeenCalled();
  });

  it('allows write when incoming is newer than cached', async () => {
    const cachedEntry = new CacheEntry();
    cachedEntry.key = 'user:1';
    cachedEntry.value = JSON.stringify({ id: '1', version: 1 });
    cachedEntry.expiresAt = Date.now() + 60_000;

    let upserted: any = null;
    const transactionalEm: any = {
      findOne: vi.fn().mockResolvedValue(cachedEntry),
      nativeUpdate: vi
        .fn()
        .mockImplementation(async (_entity, _filter, data) => {
          upserted = data;
          return 1;
        }),
    };

    const mockStore: any = {
      em: {},
      transactional: vi.fn().mockImplementation(async (cb) => {
        return cb(transactionalEm);
      }),
    };

    const cache = new MikroOrmCache<{ id: string; version: number }>(mockStore);
    await cache.set(
      'user:1',
      { id: '1', version: 2 },
      {
        isNewer: (cached, incoming) =>
          (cached as any).version > (incoming as any).version,
      },
    );

    expect(transactionalEm.nativeUpdate).toHaveBeenCalled();
    expect(JSON.parse(upserted.value)).toEqual({ id: '1', version: 2 });
  });

  it('supports explicit deletion', async () => {
    const mockEm: any = {
      nativeDelete: vi.fn().mockResolvedValue(1),
    };
    const mockStore: any = { em: mockEm };

    const cache = new MikroOrmCache(mockStore);
    await cache.delete('key1');

    expect(mockEm.nativeDelete).toHaveBeenCalledWith(CacheEntry, {
      key: 'key1',
    });
  });
});

it('rechecks newer data after a conditional update loses a race', async () => {
  const em = {
    findOne: vi
      .fn()
      .mockResolvedValueOnce({
        key: 'k',
        value: '{"version":1}',
        expiresAt: null,
      })
      .mockResolvedValueOnce({
        key: 'k',
        value: '{"version":3}',
        expiresAt: null,
      }),
    nativeUpdate: vi.fn().mockResolvedValue(0),
  };
  const store = {
    transactional: (callback: (em: unknown) => Promise<void>) => callback(em),
  };
  await new MikroOrmCache(store as any).set(
    'k',
    { version: 2 },
    {
      isNewer: (old, next) => (old as any).version > (next as any).version,
    },
  );
  expect(em.nativeUpdate).toHaveBeenCalledTimes(1);
  expect(em.findOne).toHaveBeenCalledTimes(2);
});
