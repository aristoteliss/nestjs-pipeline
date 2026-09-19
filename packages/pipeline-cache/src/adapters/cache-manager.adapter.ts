/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
    // The store's error behavior is deliberately left alone. `buildCache()` sets
    // `throwOnErrors` only on the Keyv instances this package creates; a cache or
    // store handed in by the application belongs to the application, which may be
    // sharing it with another subsystem. Mutating it here contradicted that
    // documented ownership contract and changed a shared object's semantics as a
    // side effect of module initialization.
    //
    // Caller-owned stores that swallow backend errors simply produce a cache miss
    // rather than a thrown error; the event listeners below still surface
    // whatever the store does report.
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
