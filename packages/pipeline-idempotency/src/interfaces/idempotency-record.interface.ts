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

/** Pipeline request kinds an idempotency policy can apply to. */
export type IdempotencyRequestKind = 'command' | 'query' | 'event' | 'unknown';

/** Lifecycle state of an idempotency key. */
export type IdempotencyStatus = 'in_progress' | 'completed';

/**
 * The durable record stored under an idempotency key. While a handler runs the
 * record is `in_progress`; once it succeeds the record flips to `completed` and
 * carries the captured {@link response} for replay.
 */
export interface IdempotencyRecord {
  /** The idempotency key this record is stored under. */
  key: string;
  /** Whether the original request is still running or has completed. */
  status: IdempotencyStatus;
  /** The request type name, e.g. `CreateUserCommand`. */
  requestName: string;
  /**
   * Unique owner token for the execution that claimed this record. New claims
   * always include it; it is optional only so records written by an older
   * package version can still be read/replayed during a rolling upgrade.
   */
  claimId?: string;
  /**
   * Stable hash of the original request payload. Used to detect a key being
   * reused with a *different* body (a client bug or replay attack).
   */
  fingerprint?: string;
  /** The handler's response, captured once `status` is `completed`. */
  response?: unknown;
  /** ISO-8601 timestamp the key was first claimed. */
  createdAt: string;
  /** ISO-8601 timestamp the original request completed, when applicable. */
  completedAt?: string;
}
