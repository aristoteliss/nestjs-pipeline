/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type {
  CacheFillOptions,
  CacheSetOptions,
  CacheStateEntry,
  IVersionedCache,
} from '../cache.interface';

export const CACHE_TOKEN = Symbol('MemoryCache');

export type MemoryCacheSetOptions = CacheSetOptions;

/**
 * Upper bound on retained active payload keys.
 */
export const DEFAULT_MAX_ENTRIES = 10_000;

function detach<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') {
    return value;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

interface MemoryCacheEntry<T> {
  revision: bigint;
  value?: T;
  expiresAt?: number;
  hasValue: boolean;
}

/**
 * In-memory implementation of {@link IVersionedCache} maintaining deep detachment parity
 * with database/network caches via JSON cloning on both `set()` and `get()`.
 *
 * Implements revision-fenced coordination:
 * - Maintains monotonic revisions per key across writes and invalidations.
 * - Retains coordination metadata on payload expiry to prevent ABA stale fills.
 * - Bounds active payload capacity separately from coordination metadata.
 */
export class MemoryCache<T> implements IVersionedCache<T> {
  readonly isVersioned = true as const;

  private store: Map<string, MemoryCacheEntry<T>> = new Map();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;

  constructor(options?: {
    defaultTtlMs?: number;
    maxEntries?: number;
  }) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 60_000;
    this.maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  /**
   * Drops expired entries, then the oldest surviving ones until the store fits.
   */
  private evict(): void {
    if (this.store.size <= this.maxEntries) return;

    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expiresAt !== undefined && now > entry.expiresAt) {
        this.store.delete(key);
      }
    }

    for (const key of this.store.keys()) {
      if (this.store.size <= this.maxEntries) break;
      this.store.delete(key);
    }
  }

  /**
   * Observes current key state and opaque revision token.
   */
  async readState(key: string): Promise<CacheStateEntry<T>> {
    const entry = this.store.get(key);
    if (!entry) {
      return { status: 'miss', revision: '0' };
    }

    if (entry.hasValue) {
      if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
        return { status: 'expired', revision: entry.revision.toString() };
      }
      return {
        status: 'hit',
        value: detach(entry.value),
        revision: entry.revision.toString(),
      };
    }

    return { status: 'miss', revision: entry.revision.toString() };
  }

  /**
   * Atomically advances the key revision and removes the value.
   */
  async invalidate(key: string): Promise<string> {
    const existing = this.store.get(key);
    if (existing) {
      existing.revision += 1n;
      existing.hasValue = false;
      existing.value = undefined;
      existing.expiresAt = undefined;
      return existing.revision.toString();
    }

    const initialRevision = 1n;
    this.store.set(key, {
      revision: initialRevision,
      hasValue: false,
    });
    this.evict();
    return initialRevision.toString();
  }

  /**
   * Atomically checks that current revision matches `observedRevision`, writes
   * value, and advances revision on match.
   */
  async tryFill(
    key: string,
    observedRevision: string,
    value: T,
    options?: CacheFillOptions,
  ): Promise<boolean> {
    const existing = this.store.get(key);
    const currentRevision = existing ? existing.revision.toString() : '0';

    if (currentRevision !== observedRevision) {
      return false;
    }

    const ttl = options?.ttl ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : undefined;
    const nextRevision = (existing ? existing.revision : 0n) + 1n;

    if (existing) {
      existing.revision = nextRevision;
      existing.value = detach(value);
      existing.expiresAt = expiresAt;
      existing.hasValue = true;
    } else {
      this.store.set(key, {
        revision: nextRevision,
        value: detach(value),
        expiresAt,
        hasValue: true,
      });
    }

    this.evict();
    return true;
  }

  /**
   * Stores a value in memory, cloning it via JSON round-trip to guarantee detachment.
   * Enforces TTL expiration and optional atomic CAS stale-write protection (`isNewer`).
   */
  async set(
    key: string,
    value: T,
    options?: MemoryCacheSetOptions,
  ): Promise<void> {
    const existing = this.store.get(key);
    if (existing?.hasValue) {
      if (existing.expiresAt !== undefined && Date.now() > existing.expiresAt) {
        existing.hasValue = false;
        existing.value = undefined;
        existing.expiresAt = undefined;
      } else if (options?.isNewer?.(existing.value, value)) {
        return;
      }
    }

    const ttl = options?.ttl ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : undefined;
    const nextRevision = (existing ? existing.revision : 0n) + 1n;

    if (existing) {
      existing.revision = nextRevision;
      existing.value = detach(value);
      existing.expiresAt = expiresAt;
      existing.hasValue = true;
    } else {
      this.store.set(key, {
        revision: nextRevision,
        value: detach(value),
        expiresAt,
        hasValue: true,
      });
    }

    this.evict();
  }

  /**
   * Retrieves a cached value, checking TTL and returning a detached clone.
   */
  async get(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry?.hasValue) return undefined;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      entry.hasValue = false;
      entry.value = undefined;
      entry.expiresAt = undefined;
      return undefined;
    }
    return detach(entry.value);
  }

  /**
   * Explicitly evicts a key from memory while advancing its revision.
   */
  async delete(key: string): Promise<void> {
    await this.invalidate(key);
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
