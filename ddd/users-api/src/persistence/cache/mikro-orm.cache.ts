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
   * Get a value from the cache by key. Handles TTL expiry and lazy eviction.
   */
  async get(key: string): Promise<T | undefined> {
    const entry = await this.store.em.findOne(CacheEntry, { key });

    if (!entry) return undefined;

    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      await this.store.em.nativeDelete(CacheEntry, { key });
      return undefined;
    }

    return JSON.parse(entry.value) as T;
  }

  /**
   * Set a value in the cache, with optional TTL (time-to-live) and conditional newer check.
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

  async delete(key: string): Promise<void> {
    await this.store.em.nativeDelete(CacheEntry, { key });
  }
}
