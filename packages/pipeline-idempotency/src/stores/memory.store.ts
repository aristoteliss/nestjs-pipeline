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

import type { IdempotencyRecord } from '../interfaces/idempotency-record.interface';
import type { IdempotencyStore } from '../interfaces/idempotency-store.interface';

interface Entry {
  record: IdempotencyRecord;
  expiresAt: number;
}

/**
 * Zero-dependency, in-process {@link IdempotencyStore} backed by a `Map` with
 * per-entry expiry. The **default** store — ideal for a single instance, tests,
 * or local development.
 *
 * Because Node runs JavaScript on a single thread, {@link setIfAbsent} is
 * effectively atomic here. State is **not** shared across processes, so for a
 * multi-instance deployment use {@link RedisIdempotencyStore} or
 * {@link PostgresIdempotencyStore}.
 */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, Entry>();

  get(key: string): IdempotencyRecord | undefined {
    return this.live(key)?.record;
  }

  setIfAbsent(key: string, record: IdempotencyRecord, ttlMs: number): boolean {
    if (this.live(key)) {
      return false;
    }
    this.entries.set(key, { record, expiresAt: Date.now() + ttlMs });
    return true;
  }

  set(key: string, record: IdempotencyRecord, ttlMs: number): void {
    this.entries.set(key, { record, expiresAt: Date.now() + ttlMs });
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
