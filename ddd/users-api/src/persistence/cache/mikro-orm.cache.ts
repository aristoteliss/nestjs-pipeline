/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable, Optional } from '@nestjs/common';
import { CacheSetOptions, ICache } from '@nestjs-pipeline/ddd-core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '../mikro-orm.store';
import { CacheEntry } from './cache.entity';

export type { CacheSetOptions };

/**
 * MikroOrmCache is the PRIMARY cache implementation for this app.
 * Uses MikroORM for persistence, storing cache entries in the 'cache' table.
 */
@Injectable()
export class MikroOrmCache<T> implements ICache<T> {
  private readonly defaultTtlMs: number;

  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
    @Optional() options?: { defaultTtlMs?: number },
  ) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 60_000;
  }

  /**
   * Get a value from the cache by key. Handles TTL expiry and CAS-safe lazy eviction.
   * Reads bypass the MikroORM identity map to guarantee fresh persistence state.
   */
  async get(key: string): Promise<T | undefined> {
    const entry = await this.findEntry(key);

    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      return this.evictExpiredEntry(entry);
    }

    return this.parseValue(entry.value);
  }

  private async findEntry(key: string): Promise<CacheEntry | null> {
    return this.store.em.findOne(
      CacheEntry,
      { key },
      { disableIdentityMap: true },
    );
  }

  private isExpired(entry: CacheEntry): boolean {
    return entry.expiresAt !== null && entry.expiresAt < Date.now();
  }

  private async evictExpiredEntry(entry: CacheEntry): Promise<T | undefined> {
    const affected = await this.store.em.nativeDelete(CacheEntry, {
      key: entry.key,
      value: entry.value,
      expiresAt: entry.expiresAt,
    });

    if (affected === 0) {
      const fresh = await this.findEntry(entry.key);

      if (fresh && !this.isExpired(fresh)) {
        return this.parseValue(fresh.value);
      }
    }

    return undefined;
  }

  private parseValue(raw: string): T {
    return JSON.parse(raw) as T;
  }

  /**
   * Stores a value in the relational cache table with transactional CAS concurrency safety.
   *
   * When `options.isNewer` is configured, executes a CAS loop comparing the incoming snapshot
   * against the current persisted entry. If the existing cached entry is newer, the write is
   * skipped without regressing the cache.
   *
   * @example
   * ```typescript
   * await cache.set('user:1', userSnapshot, {
   *   ttl: 60_000,
   *   isNewer: isCacheNewer,
   * });
   * ```
   *
   * @param key - Unique cache key.
   * @param value - Snapshot value to serialize and persist.
   * @param options - Cache options including TTL and atomic version comparator.
   */
  async set(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const ttl = options?.ttl ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : null;

    const isNewer = options?.isNewer;
    if (isNewer) {
      await this.store.transactional(async (em) => {
        // Compare-and-swap the exact state we inspected. A competing write makes
        // nativeUpdate affect zero rows, so retry against the newly stored value.
        for (;;) {
          const existing = await em.findOne(
            CacheEntry,
            { key },
            { refresh: true },
          );
          if (!existing) {
            await em.upsert(
              CacheEntry,
              {
                key,
                value: JSON.stringify(value),
                expiresAt,
              },
              { onConflictAction: 'ignore' },
            );
            continue;
          }
          if (existing.expiresAt === null || existing.expiresAt >= Date.now()) {
            let parsed: unknown;
            try {
              parsed = JSON.parse(existing.value);
            } catch {
              /* Replace corrupt data. */
            }
            if (parsed !== undefined && isNewer(parsed, value)) return;
          }
          const affected = await em.nativeUpdate(
            CacheEntry,
            {
              key,
              value: existing.value,
              expiresAt: existing.expiresAt,
            },
            { value: JSON.stringify(value), expiresAt },
          );
          if (affected > 0) return;
        }
      });
      return;
    }

    await this.store.em.upsert(CacheEntry, {
      key,
      value: JSON.stringify(value),
      expiresAt,
    });
  }

  /**
   * Explicitly evicts a key from the database cache table.
   *
   * @example
   * ```typescript
   * await cache.delete('user:1');
   * ```
   *
   * @param key - Cache key to evict.
   */
  async delete(key: string): Promise<void> {
    await this.store.em.nativeDelete(CacheEntry, { key });
  }
}
