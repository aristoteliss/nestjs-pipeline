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

import { Inject, Injectable } from '@nestjs/common';
import { ICache } from '@nestjs-pipeline/ddd-core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '../mikro-orm.store';
import { CacheEntry } from './cache.entity';

export interface CacheSetOptions {
  ttl?: number;
}

/**
 * MikroOrmCache is the PRIMARY cache implementation for this app.
 * Uses MikroORM for persistence, storing cache entries in the 'cache' table.
 */
@Injectable()
export class MikroOrmCache<T> implements ICache<T> {
  constructor(
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) { }

  /**
   * Get a value from the cache by key. Handles TTL expiry and lazy eviction.
   */
  async get(key: string): Promise<T | undefined> {
    const entry = await this.store.em.findOne(CacheEntry, { key });

    if (!entry) return undefined;

    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.em.remove(entry);
      await this.store.em.flush();
      return undefined;
    }

    return JSON.parse(entry.value) as T;
  }

  /**
   * Set a value in the cache, with optional TTL (time-to-live).
   */
  async set(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const expiresAt = options?.ttl != null ? Date.now() + options.ttl : null;

    // Check if exists
    let entry = await this.store.em.findOne(CacheEntry, { key });
    if (!entry) {
      entry = this.store.em.create(CacheEntry, {
        key,
        value: JSON.stringify(value),
        expiresAt,
      });
      this.store.em.persist(entry);
    } else {
      entry.value = JSON.stringify(value);
      entry.expiresAt = expiresAt;
    }

    await this.store.em.flush();
  }

  async delete(key: string): Promise<void> {
    const entry = await this.store.em.findOne(CacheEntry, { key });
    if (entry) {
      this.store.em.remove(entry);
      await this.store.em.flush();
    }
  }
}
