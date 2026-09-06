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

import EventEmitter from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { CacheManagerAdapter } from './cache-manager.adapter';

class MockCacheManager extends EventEmitter {
  public stores: any[] = [];
  public store = new Map<string, any>();

  constructor() {
    super();
    this.stores = [{ throwOnErrors: false }];
  }

  async get(key: string): Promise<unknown> {
    return this.store.get(key);
  }

  async set(key: string, value: unknown, _ttl?: number): Promise<unknown> {
    this.store.set(key, value);
    return value;
  }
}

describe('CacheManagerAdapter', () => {
  it('enables throwOnErrors on all underlying stores during instantiation', () => {
    const mockCache = new MockCacheManager();
    new CacheManagerAdapter(mockCache as any);

    expect(mockCache.stores[0].throwOnErrors).toBe(true);
  });

  it('delegates get and set operations successfully', async () => {
    const mockCache = new MockCacheManager();
    const adapter = new CacheManagerAdapter(mockCache as any);

    await adapter.set('user:1', { id: '1', name: 'Alice' });
    const result = await adapter.get('user:1');

    expect(result).toEqual({ id: '1', name: 'Alice' });
  });

  it('throws storeError when get event with matching key contains error', async () => {
    const mockCache = new MockCacheManager();
    const expectedError = new Error('Redis connection failed');

    vi.spyOn(mockCache, 'get').mockImplementation(async (key: string) => {
      mockCache.emit('get', { key, error: expectedError });
      return undefined;
    });

    const adapter = new CacheManagerAdapter(mockCache as any);
    await expect(adapter.get('failing-key')).rejects.toThrow(
      'Redis connection failed',
    );
  });

  it('does not contaminate concurrent get operations for different keys', async () => {
    const mockCache = new MockCacheManager();
    const key2Error = new Error('Key 2 store failure');

    vi.spyOn(mockCache, 'get').mockImplementation(async (key: string) => {
      // Simulate async delay
      await new Promise((resolve) => setTimeout(resolve, 10));
      if (key === 'key2') {
        mockCache.emit('get', { key: 'key2', error: key2Error });
        return undefined;
      }
      return 'value-1';
    });

    const adapter = new CacheManagerAdapter(mockCache as any);

    const [res1, res2] = await Promise.allSettled([
      adapter.get('key1'),
      adapter.get('key2'),
    ]);

    expect(res1.status).toBe('fulfilled');
    if (res1.status === 'fulfilled') {
      expect(res1.value).toBe('value-1');
    }

    expect(res2.status).toBe('rejected');
    if (res2.status === 'rejected') {
      expect(res2.reason).toBe(key2Error);
    }
  });

  it('throws storeError when set event with matching key contains error', async () => {
    const mockCache = new MockCacheManager();
    const expectedError = new Error('Write failed');

    vi.spyOn(mockCache, 'set').mockImplementation(
      async (key: string, value: unknown) => {
        mockCache.emit('set', { key, value, error: expectedError });
        return undefined;
      },
    );

    const adapter = new CacheManagerAdapter(mockCache as any);
    await expect(adapter.set('key1', 'val')).rejects.toThrow('Write failed');
  });

  it('ignores error events belonging to other keys', async () => {
    const mockCache = new MockCacheManager();

    vi.spyOn(mockCache, 'get').mockImplementation(async (key: string) => {
      // Emit error for another key
      mockCache.emit('error', {
        key: 'other-key',
        error: new Error('other failed'),
      });
      return `val-${key}`;
    });

    const adapter = new CacheManagerAdapter(mockCache as any);
    const result = await adapter.get('my-key');

    expect(result).toBe('val-my-key');
  });

  it('does not contaminate concurrent get operations for the same key when one succeeds', async () => {
    const mockCache = new MockCacheManager();
    const storeError = new Error('Transient backend error');
    let callIndex = 0;

    vi.spyOn(mockCache, 'get').mockImplementation(async (_key: string) => {
      const currentCall = ++callIndex;
      await new Promise((resolve) => setTimeout(resolve, 5));
      if (currentCall === 1) {
        mockCache.emit('get', { key: 'same-key', error: storeError });
        return undefined;
      }
      return 'successful-value';
    });

    const adapter = new CacheManagerAdapter(mockCache as any);
    const [res1, res2] = await Promise.allSettled([
      adapter.get('same-key'),
      adapter.get('same-key'),
    ]);

    expect(res1.status).toBe('rejected');
    if (res1.status === 'rejected') {
      expect(res1.reason).toBe(storeError);
    }

    expect(res2.status).toBe('fulfilled');
    if (res2.status === 'fulfilled') {
      expect(res2.value).toBe('successful-value');
    }
  });
});
