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
   * Implementations should be resilient; a throw here is caught by the behavior
   * and logged (when `failOpen`), but never masks the original handler result
   * or error.
   *
   * @param record - The completed audit entry to forward.
   */
  write(record: AuditRecord): Promise<void> | void;
}
