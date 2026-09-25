/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { AuditRecord } from './audit-record.interface';

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
}
