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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
});
