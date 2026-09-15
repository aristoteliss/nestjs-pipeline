/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { CacheSetOptions, ICache } from '../cache.interface';

export const CACHE_TOKEN = Symbol('MemoryCache');

export type MemoryCacheSetOptions = CacheSetOptions;

function detach<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * In-memory implementation of {@link ICache} maintaining deep detachment parity
 * with database/network caches via JSON cloning on both `set()` and `get()`.
 *
 * Guarantees ownership isolation so caller mutations never bleed into or mutate cached state.
 *
 * @example Usage with versioned snapshot
 * ```typescript
 * const cache = new MemoryCache<UserSnapshot>({ defaultTtlMs: 30_000 });
 * await cache.set('user:1', { id: '1', version: 2 });
 * const snapshot = await cache.get('user:1');
 * ```
 */
export class MemoryCache<T> implements ICache<T> {
  private store: Map<string, { value: T; expiresAt?: number }> = new Map();
  private readonly defaultTtlMs: number;

  constructor(options?: { defaultTtlMs?: number }) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 60_000;
  }

  /**
   * Stores a value in memory, cloning it via JSON round-trip to guarantee detachment.
   * Enforces TTL expiration and optional atomic CAS stale-write protection (`isNewer`).
   *
   * @param key - Unique cache key.
   * @param value - Value or snapshot to store (detached on write).
   * @param options - Cache options including TTL and atomic version comparator.
   */
  async set(
    key: string,
    value: T,
    options?: MemoryCacheSetOptions,
  ): Promise<void> {
    const existing = this.store.get(key);
    if (existing) {
      if (existing.expiresAt !== undefined && Date.now() > existing.expiresAt) {
        this.store.delete(key);
      } else if (options?.isNewer?.(existing.value, value)) {
        return;
      }
    }

    const ttl = options?.ttl ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : undefined;
    this.store.set(key, { value: detach(value), expiresAt });
  }

  /**
   * Retrieves a cached value, checking TTL and returning a detached clone.
   *
   * @param key - Cache key to retrieve.
   * @returns Cloned snapshot if found and live; `undefined` if missing or expired.
   */
  async get(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return detach(entry.value);
  }

  /**
   * Explicitly evicts a key from memory.
   *
   * @param key - Cache key to evict.
   */
  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /**
   * Purges all keys from the in-memory cache.
   */
  async clear(): Promise<void> {
    this.store.clear();
  }

  /**
   * Current number of keys in the in-memory cache.
   */
  get size(): number {
    return this.store.size;
  }
}
