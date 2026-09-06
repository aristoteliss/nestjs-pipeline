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

import { cloneIdempotencyRecord } from '../helpers/json-snapshot';
import type { IdempotencyRecord } from '../interfaces/idempotency-record.interface';
import type { IdempotencyStore } from '../interfaces/idempotency-store.interface';

interface Entry {
  record: IdempotencyRecord;
  expiresAt: number;
}

export interface MemoryIdempotencyStoreOptions {
  /** Maximum number of entries allowed in the store. Defaults to 10,000. */
  maxEntries?: number;
  /**
   * Interval in milliseconds for periodic background cleanup of expired entries.
   * Defaults to 30,000 ms. If 0 or negative, periodic cleanup timer is disabled.
   */
  cleanupIntervalMs?: number;
}

/**
 * Zero-dependency, in-process {@link IdempotencyStore} backed by a `Map` with
 * per-entry expiry and bounded memory capacity. The **default** store — ideal
 * for a single instance, tests, or local development.
 *
 * Because Node runs JavaScript on a single thread, {@link setIfAbsent},
 * {@link completeIfOwned}, and {@link deleteIfOwned} are effectively atomic
 * here. State is **not** shared across processes, so for a multi-instance
 * deployment use {@link RedisIdempotencyStore} or
 * {@link PostgresIdempotencyStore}.
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly cleanupTimer?: NodeJS.Timeout;

  constructor(options?: MemoryIdempotencyStoreOptions) {
    this.maxEntries = options?.maxEntries ?? 10_000;
    const interval = options?.cleanupIntervalMs ?? 30_000;
    if (interval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpired();
      }, interval);
      if (typeof this.cleanupTimer?.unref === 'function') {
        this.cleanupTimer.unref();
      }
    }
  }

  /** Current number of active (stored) entries. */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Iterates through all entries and removes any whose TTL has elapsed.
   * Returns the count of deleted entries.
   */
  cleanupExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        count++;
      }
    }
    return count;
  }

  /** Stops the periodic cleanup timer and releases timer resources. */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }

  private ensureCapacity(): void {
    if (this.entries.size < this.maxEntries) {
      return;
    }
    this.cleanupExpired();
    while (this.entries.size >= this.maxEntries && this.entries.size > 0) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey !== undefined) {
        this.entries.delete(oldestKey);
      } else {
        break;
      }
    }
  }

  get(key: string): IdempotencyRecord | undefined {
    const record = this.live(key)?.record;
    return record ? cloneIdempotencyRecord(record) : undefined;
  }

  setIfAbsent(key: string, record: IdempotencyRecord, ttlMs: number): boolean {
    if (this.live(key)) {
      return false;
    }
    this.ensureCapacity();
    this.entries.set(key, {
      record: cloneIdempotencyRecord(record),
      expiresAt: Date.now() + ttlMs,
    });
    return true;
  }

  completeIfOwned(
    key: string,
    claimId: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): boolean {
    const current = this.live(key);
    if (
      current?.record.status !== 'in_progress' ||
      current.record.claimId !== claimId
    ) {
      return false;
    }

    this.entries.set(key, {
      record: cloneIdempotencyRecord(record),
      expiresAt: Date.now() + ttlMs,
    });
    return true;
  }

  deleteIfOwned(key: string, claimId: string): boolean {
    const current = this.live(key);
    if (!current || current.record.claimId !== claimId) {
      return false;
    }
    return this.entries.delete(key);
  }

  set(key: string, record: IdempotencyRecord, ttlMs: number): void {
    if (!this.entries.has(key)) {
      this.ensureCapacity();
    }
    this.entries.set(key, {
      record: cloneIdempotencyRecord(record),
      expiresAt: Date.now() + ttlMs,
    });
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Returns the entry for `key` if present and not expired, pruning if it is. */
  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }
}
