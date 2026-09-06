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

import type { Cache } from 'cache-manager';

/**
 * Common interface for cache interactions within the pipeline.
 */
export interface IPipelineCache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<unknown>;
}

/**
 * Adapter wrapping a cache-manager Cache instance to reliably expose backend
 * store errors that cache-manager would otherwise swallow in get().
 */
export class CacheManagerAdapter implements IPipelineCache {
  constructor(private readonly cache: Cache) {
    if (cache && Array.isArray(cache.stores)) {
      for (const store of cache.stores) {
        if (store && typeof store === 'object' && 'throwOnErrors' in store) {
          store.throwOnErrors = true;
        }
      }
    }
  }

  async get(key: string): Promise<unknown> {
    let storeError: unknown = undefined;
    const onGet = (event: { key?: string; error?: unknown }) => {
      if (event && event.key === key && event.error) {
        storeError = event.error;
      }
    };

    if (typeof this.cache.on === 'function') {
      this.cache.on('get', onGet);
    }

    try {
      const result = await this.cache.get(key);
      if (storeError !== undefined) {
        throw storeError;
      }
      return result;
    } finally {
      if (typeof this.cache.off === 'function') {
        this.cache.off('get', onGet);
      }
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<unknown> {
    let storeError: unknown = undefined;
    const onSet = (event: { key?: string; error?: unknown }) => {
      if (event && event.key === key && event.error) {
        storeError = event.error;
      }
    };

    if (typeof this.cache.on === 'function') {
      this.cache.on('set', onSet);
    }

    try {
      const result = await this.cache.set(key, value, ttl);
      if (storeError !== undefined) {
        throw storeError;
      }
      return result;
    } finally {
      if (typeof this.cache.off === 'function') {
        this.cache.off('set', onSet);
      }
    }
  }
}
