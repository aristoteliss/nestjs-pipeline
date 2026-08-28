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

import type { IdempotencyRecord } from './idempotency-record.interface';

/** A value that may be returned synchronously or as a promise. */
export type MaybePromise<T> = T | Promise<T>;

/**
 * Backend-agnostic store for idempotency records — the single seam every
 * storage backend implements. Because {@link IdempotencyBehavior} depends only
 * on this interface, swapping the backend (memory, Redis, Postgres, your own)
 * is a one-line change in {@link IdempotencyModule.forRoot}; handlers never
 * change.
 *
 * Concurrent duplicate exclusion hinges on {@link setIfAbsent} being **atomic**
 * — it must claim the key only if no live record exists (e.g. Redis `SET NX PX`,
 * Postgres `INSERT … ON CONFLICT DO NOTHING`). Atomic claiming prevents two
 * live duplicates from both acquiring the same key; it does not by itself imply
 * exactly-once execution across failures/retries.
 */
export interface IdempotencyStore {
  /**
   * Returns the live (non-expired) record for `key`, or `undefined` if there is
   * none.
   */
  get(key: string): MaybePromise<IdempotencyRecord | undefined>;

  /**
   * Atomically stores `record` **only if** no live record exists for `key`.
   *
   * @returns `true` if the key was claimed by this call, `false` if a live
   * record already existed.
   */
  setIfAbsent(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): MaybePromise<boolean>;

  /**
   * Overwrites the record for `key` (used to flip `in_progress` → `completed`),
   * refreshing its TTL.
   */
  set(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): MaybePromise<void>;

  /** Removes the record for `key` (used to release a key after a failure). */
  delete(key: string): MaybePromise<void>;
}
