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

import { AsyncLocalStorage } from 'node:async_hooks';
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
export class CacheManagerAdapter {
  // cache-manager emits errors in the originating operation's async context.
  // A key alone cannot identify concurrent reads, writes, or fallback lookups.
  private readonly operation = new AsyncLocalStorage<{
    key: string;
    kind: 'get' | 'set';
    error?: unknown;
  }>();

  constructor(private readonly cache: Cache) {
    for (const store of cache.stores ?? []) {
      if ('throwOnErrors' in store) store.throwOnErrors = true;
    }
    const emitter = cache as unknown as {
      on?: (event: string, listener: (event: unknown) => void) => void;
    };
    emitter.on?.('get', (event) => this.captureError('get', event));
    emitter.on?.('set', (event) => this.captureError('set', event));
    emitter.on?.('error', (event) => this.captureError(undefined, event));
  }

  private captureError(kind: 'get' | 'set' | undefined, event: unknown): void {
    const operation = this.operation.getStore();
    if (!operation || (kind && operation.kind !== kind)) return;
    if (
      event &&
      typeof event === 'object' &&
      'key' in event &&
      event.key === operation.key &&
      'error' in event
    ) {
      operation.error = event.error;
    }
  }

  async get(key: string): Promise<unknown> {
    return this.operation.run({ key, kind: 'get' }, async () => {
      const value = await this.cache.get(key);
      const error = this.operation.getStore()?.error;
      if (value === undefined && error !== undefined) throw error;
      return value;
    });
  }

  async set(key: string, value: unknown, ttl?: number): Promise<unknown> {
    return this.operation.run({ key, kind: 'set' }, async () => {
      const result = await this.cache.set(key, value, ttl);
      const error = this.operation.getStore()?.error;
      if (error !== undefined) throw error;
      return result;
    });
  }
}
