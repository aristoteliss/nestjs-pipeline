/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { AuditRecord, AuditStartRecord } from './audit-record.interface';

/**
 * Backend-agnostic sink for audit records — the single seam every storage
 * backend implements.
 *
 * Implement this once per backend; the bundled implementations are
 * {@link LogAuditSink} (default, zero-dependency) and
 * {@link PostgresAuditSink}. Because {@link AuditBehavior} depends only on this
 * interface, swapping the backend (Postgres, an event store, Kafka, an HTTP
 * collector, …) is a one-line change in {@link AuditModule.forRoot}.
 */
export interface AuditSink {
  /**
   * Persist / publish a single audit record.
   *
   * Implementations should be resilient. A throw here is logged by the
   * behavior; with `failOpen: false` it also fails a successful request. A
   * handler error is always rethrown unchanged.
   *
   * @param record - The completed audit entry to forward.
   */
  write(record: AuditRecord): Promise<void> | void;

  /**
   * Persist the start of an operation, before its handler runs. Optional:
   * when implemented, {@link AuditBehavior} calls it first (unless
   * `recordStart: false`), then calls {@link write} with the final record
   * under the same `id`, which must replace this one. An attempt interrupted
   * by a process stop then stays visible as `'pending'` instead of being lost.
   *
   * A throw here is logged by the behavior; with `failOpen: false` it also
   * stops the request before its handler runs.
   *
   * @param record - The pending entry for the operation about to run.
   */
  begin?(record: AuditStartRecord): Promise<void> | void;
}
