/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isVersionedCache } from '../cache.interface';
import { MemoryCache } from './memory.cache';

describe('MemoryCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores and retrieves values before TTL expiration', async () => {
    const cache = new MemoryCache<string>({ defaultTtlMs: 10_000 });
    await cache.set('key1', 'value1');

    const result = await cache.get('key1');
    expect(result).toBe('value1');
  });

  it('evicts and returns undefined after default TTL has passed', async () => {
    const cache = new MemoryCache<string>({ defaultTtlMs: 5_000 });
    await cache.set('key1', 'value1');

    vi.advanceTimersByTime(5_001);

    const result = await cache.get('key1');
    expect(result).toBeUndefined();
  });

  it('respects per-item custom TTL in options', async () => {
    const cache = new MemoryCache<string>({ defaultTtlMs: 60_000 });
    await cache.set('short-lived', 'val', { ttl: 2_000 });

    vi.advanceTimersByTime(1_500);
    expect(await cache.get('short-lived')).toBe('val');

    vi.advanceTimersByTime(600);
    expect(await cache.get('short-lived')).toBeUndefined();
  });

  it('supports explicit deletion', async () => {
    const cache = new MemoryCache<string>();
    await cache.set('key1', 'value1');
    await cache.delete('key1');

    expect(await cache.get('key1')).toBeUndefined();
  });

  it('rejects stale write when isNewer indicates cached entry is newer', async () => {
    const cache = new MemoryCache<{ id: string; version: number }>();
    await cache.set('user:1', { id: '1', version: 2 });

    await cache.set(
      'user:1',
      { id: '1', version: 1 },
      {
        isNewer: (cached, incoming) =>
          (cached as any).version > (incoming as any).version,
      },
    );

    const current = await cache.get('user:1');
    expect(current).toEqual({ id: '1', version: 2 });
  });

  it('allows write when incoming is newer than cached', async () => {
    const cache = new MemoryCache<{ id: string; version: number }>();
    await cache.set('user:1', { id: '1', version: 1 });

    await cache.set(
      'user:1',
      { id: '1', version: 2 },
      {
        isNewer: (cached, incoming) =>
          (cached as any).version > (incoming as any).version,
      },
    );

    const current = await cache.get('user:1');
    expect(current).toEqual({ id: '1', version: 2 });
  });

  it('overwrites expired entry even if expired value had higher version', async () => {
    const cache = new MemoryCache<{ id: string; version: number }>({
      defaultTtlMs: 5_000,
    });
    await cache.set('user:1', { id: '1', version: 5 });

    vi.advanceTimersByTime(5_001);

    await cache.set(
      'user:1',
      { id: '1', version: 1 },
      {
        isNewer: (cached, incoming) =>
          (cached as any).version > (incoming as any).version,
      },
    );

    const current = await cache.get('user:1');
    expect(current).toEqual({ id: '1', version: 1 });
  });
});

describe('MemoryCache retention bounds', () => {
  it('drops expired entries once the store is over its limit', async () => {
    const cache = new MemoryCache<{ n: number }>({ maxEntries: 3 });

    await cache.set('keep', { n: 0 }, { ttl: 60_000 });
    await cache.set('a', { n: 1 }, { ttl: 1 });
    await cache.set('b', { n: 2 }, { ttl: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await cache.set('c', { n: 3 }, { ttl: 60_000 });
    await cache.set('d', { n: 4 }, { ttl: 60_000 });

    expect(await cache.get('keep')).toEqual({ n: 0 });
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBeUndefined();
    expect(cache.size).toBeLessThanOrEqual(3);
  });

  it('never grows past the limit even when nothing has expired', async () => {
    // The limit also holds for entries nobody reads again, such as the revision
    // metadata a deletion keeps.
    const cache = new MemoryCache<{ n: number }>({ maxEntries: 5 });

    for (let n = 0; n < 200; n += 1) {
      await cache.set(`key-${n}`, { n }, { ttl: 600_000 });
    }

    expect(cache.size).toBeLessThanOrEqual(5);
    expect(await cache.get('key-199')).toEqual({ n: 199 });
  });
});

describe('MemoryCache revision fencing across dropped metadata', () => {
  it('rejects a fill observed before an invalidation whose metadata was evicted', async () => {
    const cache = new MemoryCache<{ v: number }>({ maxEntries: 1 });

    const observed = await cache.readState('user:1');
    await cache.invalidate('user:1');
    await cache.set('user:2', { v: 2 });

    expect(await cache.tryFill('user:1', observed.revision, { v: 1 })).toBe(
      false,
    );
    expect(await cache.get('user:1')).toBeUndefined();
  });

  it('rejects a fill observed before an expired entry was evicted and recreated elsewhere', async () => {
    const cache = new MemoryCache<{ v: number }>({ maxEntries: 1 });
    await cache.set('user:1', { v: 1 }, { ttl: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));

    const observed = await cache.readState('user:1');
    await cache.invalidate('user:1');
    await cache.set('user:2', { v: 2 });

    expect(observed.status).toBe('expired');
    expect(await cache.tryFill('user:1', observed.revision, { v: 1 })).toBe(
      false,
    );
  });

  it('rejects every token observed before clear(), including absences', async () => {
    const cache = new MemoryCache<{ v: number }>();
    const absent = await cache.readState('user:1');
    await cache.set('user:2', { v: 2 });
    const present = await cache.readState('user:2');

    await cache.invalidate('user:1');
    await cache.clear();

    expect(await cache.tryFill('user:1', absent.revision, { v: 1 })).toBe(
      false,
    );
    expect(await cache.tryFill('user:2', present.revision, { v: 2 })).toBe(
      false,
    );
  });

  it('accepts a fill observed after the drop', async () => {
    const cache = new MemoryCache<{ v: number }>({ maxEntries: 1 });
    await cache.invalidate('user:1');
    await cache.set('user:2', { v: 2 });
    await cache.clear();

    const observed = await cache.readState('user:1');

    expect(await cache.tryFill('user:1', observed.revision, { v: 1 })).toBe(
      true,
    );
    expect(await cache.get('user:1')).toEqual({ v: 1 });
  });

  it('identifies non-versioned cache objects', () => {
    expect(isVersionedCache({ readState: () => {} })).toBe(false);
    expect(
      isVersionedCache({ readState: () => {}, invalidate: () => {} }),
    ).toBe(false);
  });

  it('stores value with non-expiring TTL when ttl <= 0', async () => {
    const cache = new MemoryCache<string>();
    await cache.set('permanent', 'value', { ttl: 0 });
    expect(await cache.get('permanent')).toBe('value');
  });
});
