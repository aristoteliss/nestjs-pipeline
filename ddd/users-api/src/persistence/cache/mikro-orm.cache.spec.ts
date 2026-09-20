/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it, vi } from 'vitest';
import { CacheEntry } from './cache.entity';
import { MikroOrmCache } from './mikro-orm.cache';

function createMockStore(mockEm: any): any {
  return {
    em: mockEm,
    transactional: vi.fn().mockImplementation(async (cb) => cb(mockEm)),
  };
}

/**
 * Models the one row `set()` touches: absent until the conflict-ignoring upsert
 * inserts it, then visible to the compare-and-set re-read.
 */
function createSingleRowEm(): any {
  let row: CacheEntry | null = null;

  return {
    inserted: () => row,
    findOne: vi.fn().mockImplementation(async () => row),
    upsert: vi.fn().mockImplementation(async (_entity, data, options) => {
      if (options?.onConflictAction === 'ignore' && row) return;
      row = Object.assign(new CacheEntry(), data);
    }),
    nativeUpdate: vi.fn().mockImplementation(async (_entity, _where, data) => {
      if (!row) return 0;
      Object.assign(row, data);
      return 1;
    }),
  };
}

describe('MikroOrmCache', () => {
  it('stores value with default 60s TTL and revision 1 when entry does not exist', async () => {
    const mockEm = createSingleRowEm();
    const mockStore = createMockStore(mockEm);

    const cache = new MikroOrmCache<{ name: string }>(mockStore);
    const before = Date.now();
    await cache.set('key1', { name: 'Alice' });
    const after = Date.now();

    expect(mockEm.findOne).toHaveBeenCalledWith(
      CacheEntry,
      { key: 'key1' },
      { refresh: true, disableIdentityMap: true },
    );
    expect(mockEm.upsert).toHaveBeenCalledWith(
      CacheEntry,
      expect.objectContaining({ key: 'key1', revision: '1' }),
      { onConflictAction: 'ignore' },
    );

    const stored = mockEm.inserted();
    expect(stored.key).toBe('key1');
    expect(JSON.parse(stored.value)).toEqual({ name: 'Alice' });
    expect(stored.expiresAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(stored.expiresAt).toBeLessThanOrEqual(after + 60_000);
  });

  it('stores value with custom TTL when specified in options', async () => {
    const mockEm = createSingleRowEm();
    const mockStore = createMockStore(mockEm);

    const cache = new MikroOrmCache<{ name: string }>(mockStore);
    const before = Date.now();
    await cache.set('key1', { name: 'Alice' }, { ttl: 5_000 });
    const after = Date.now();

    const stored = mockEm.inserted();
    expect(stored.expiresAt).toBeGreaterThanOrEqual(before + 5_000);
    expect(stored.expiresAt).toBeLessThanOrEqual(after + 5_000);
  });

  it('gives up instead of spinning when the store never reflects a write', async () => {
    const mockEm: any = {
      findOne: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue(undefined),
      nativeUpdate: vi.fn().mockResolvedValue(0),
    };

    const cache = new MikroOrmCache<{ name: string }>(createMockStore(mockEm));

    await expect(cache.set('key1', { name: 'Alice' })).rejects.toThrow(
      /could not settle key "key1"/,
    );
  });

  it('preserves revision and returns undefined on get when entry is expired', async () => {
    const expiredEntry = new CacheEntry();
    expiredEntry.key = 'expired-key';
    expiredEntry.value = JSON.stringify({ name: 'Old' });
    expiredEntry.expiresAt = Date.now() - 1000;
    expiredEntry.revision = '7';

    const mockEm: any = {
      findOne: vi.fn().mockResolvedValue(expiredEntry),
    };
    const mockStore = createMockStore(mockEm);

    const cache = new MikroOrmCache(mockStore);
    const result = await cache.get('expired-key');
    expect(result).toBeUndefined();

    const state = await cache.readState('expired-key');
    expect(state).toEqual({
      status: 'expired',
      revision: '7',
    });
    expect(mockEm.findOne).toHaveBeenCalledWith(
      CacheEntry,
      { key: 'expired-key' },
      { disableIdentityMap: true },
    );
  });

  it('bypasses identity map and returns parsed value on cache hit', async () => {
    const liveEntry = new CacheEntry();
    liveEntry.key = 'live-key';
    liveEntry.value = JSON.stringify({ name: 'Live', score: 100 });
    liveEntry.expiresAt = Date.now() + 60_000;
    liveEntry.revision = '3';

    const mockEm: any = {
      findOne: vi.fn().mockResolvedValue(liveEntry),
    };
    const mockStore = createMockStore(mockEm);

    const cache = new MikroOrmCache<{ name: string; score: number }>(mockStore);
    const result = await cache.get('live-key');

    expect(result).toEqual({ name: 'Live', score: 100 });
    expect(mockEm.findOne).toHaveBeenCalledWith(
      CacheEntry,
      { key: 'live-key' },
      { disableIdentityMap: true },
    );
  });

  it('throws and fails closed when cached JSON payload is corrupt', async () => {
    const corruptEntry = new CacheEntry();
    corruptEntry.key = 'corrupt-key';
    corruptEntry.value = 'invalid-json{{{';
    corruptEntry.expiresAt = Date.now() + 60_000;

    const mockEm: any = {
      findOne: vi.fn().mockResolvedValue(corruptEntry),
    };
    const mockStore = createMockStore(mockEm);

    const cache = new MikroOrmCache(mockStore);
    await expect(cache.get('corrupt-key')).rejects.toThrow(SyntaxError);
  });

  it('rejects stale write atomically when isNewer indicates cached entry is newer', async () => {
    const cachedEntry = new CacheEntry();
    cachedEntry.key = 'user:1';
    cachedEntry.value = JSON.stringify({ id: '1', version: 2 });
    cachedEntry.expiresAt = Date.now() + 60_000;
    cachedEntry.revision = '1';

    const transactionalEm: any = {
      findOne: vi.fn().mockResolvedValue(cachedEntry),
      nativeUpdate: vi.fn(),
    };
    const mockStore = createMockStore(transactionalEm);

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
      { key: 'user:1' },
      { refresh: true, disableIdentityMap: true },
    );
    expect(transactionalEm.nativeUpdate).not.toHaveBeenCalled();
  });

  it('allows write when incoming is newer than cached', async () => {
    const cachedEntry = new CacheEntry();
    cachedEntry.key = 'user:1';
    cachedEntry.value = JSON.stringify({ id: '1', version: 1 });
    cachedEntry.expiresAt = Date.now() + 60_000;
    cachedEntry.revision = '1';

    let updatedData: any = null;
    const transactionalEm: any = {
      findOne: vi.fn().mockResolvedValue(cachedEntry),
      nativeUpdate: vi
        .fn()
        .mockImplementation(async (_entity, _filter, data) => {
          updatedData = data;
          return 1;
        }),
    };
    const mockStore = createMockStore(transactionalEm);

    const cache = new MikroOrmCache<{ id: string; version: number }>(mockStore);
    await cache.set(
      'user:1',
      { id: '1', version: 2 },
      {
        isNewer: (cached, incoming) =>
          (cached as any).version > (incoming as any).version,
      },
    );

    expect(transactionalEm.nativeUpdate).toHaveBeenCalledWith(
      CacheEntry,
      { key: 'user:1', revision: '1' },
      expect.objectContaining({
        revision: '2',
      }),
    );
    expect(JSON.parse(updatedData.value)).toEqual({ id: '1', version: 2 });
  });

  it('supports explicit deletion via revision-advancing invalidation', async () => {
    const cachedEntry = new CacheEntry();
    cachedEntry.key = 'key1';
    cachedEntry.value = JSON.stringify({ id: '1' });
    cachedEntry.revision = '2';

    const mockEm: any = {
      findOne: vi.fn().mockResolvedValue(cachedEntry),
      nativeUpdate: vi.fn().mockResolvedValue(1),
    };
    const mockStore = createMockStore(mockEm);

    const cache = new MikroOrmCache(mockStore);
    await cache.delete('key1');

    expect(mockEm.nativeUpdate).toHaveBeenCalledWith(
      CacheEntry,
      { key: 'key1', revision: '2' },
      expect.objectContaining({
        value: '',
        expiresAt: null,
        revision: '3',
      }),
    );
  });

  it('atomically checks observed revision and fills entry on match', async () => {
    const mockEm: any = {
      nativeUpdate: vi.fn().mockResolvedValue(1),
    };
    const mockStore = createMockStore(mockEm);

    const cache = new MikroOrmCache<{ id: string }>(mockStore);
    const committed = await cache.tryFill('key1', '4', { id: 'filled' });

    expect(committed).toBe(true);
    expect(mockEm.nativeUpdate).toHaveBeenCalledWith(
      CacheEntry,
      { key: 'key1', revision: '4' },
      expect.objectContaining({
        value: JSON.stringify({ id: 'filled' }),
        revision: '5',
      }),
    );
  });

  it('rejects tryFill when observed revision does not match current state', async () => {
    const mockEm: any = {
      nativeUpdate: vi.fn().mockResolvedValue(0),
    };
    const mockStore = createMockStore(mockEm);

    const cache = new MikroOrmCache<{ id: string }>(mockStore);
    const committed = await cache.tryFill('key1', '4', { id: 'stale-fill' });

    expect(committed).toBe(false);
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
        revision: '1',
      })
      .mockResolvedValueOnce({
        key: 'k',
        value: '{"version":3}',
        expiresAt: null,
        revision: '2',
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
