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
 *
 * Ownership-sensitive transitions use `claimId`. A stale execution whose claim
 * expired must never complete or delete a newer execution's record. Built-in
 * stores implement this with an atomic compare-and-set / compare-and-delete.
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
   * Atomically replaces the live `in_progress` record with `record` only when
   * the existing record is still owned by `claimId`.
   *
   * @returns `true` when this claim completed its own record; `false` when the
   * claim expired, was replaced, or was otherwise no longer owned by the caller.
   */
  completeIfOwned(
    key: string,
    claimId: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): MaybePromise<boolean>;

  /**
   * Atomically removes the live record only when it is still owned by
   * `claimId`. Used by `releaseOnError` so a stale failure cannot delete a
   * newer execution's claim.
   */
  deleteIfOwned(key: string, claimId: string): MaybePromise<boolean>;

  /**
   * Unconditional overwrite retained for administrative/custom use. Pipeline
   * execution completion uses {@link completeIfOwned}, not this method.
   */
  set(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): MaybePromise<void>;

  /**
   * Unconditional delete retained for administrative/custom use. Pipeline
   * failure release uses {@link deleteIfOwned}, not this method.
   */
  delete(key: string): MaybePromise<void>;
}
