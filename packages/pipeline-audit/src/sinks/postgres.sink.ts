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

import { stringifyAuditValue } from '../helpers/json';
import type { AuditRecord } from '../interfaces/audit-record.interface';
import type { AuditSink } from '../interfaces/audit-sink.interface';

/**
 * Minimal structural shape of a `pg` `Pool` / `Client`. Declared locally so this
 * package does not hard-depend on `pg` — a real `Pool` or `Client` satisfies it.
 * Add it in your app: `pnpm add pg`.
 */
export interface PostgresQueryableLike {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/** Options for {@link PostgresAuditSink}. */
export interface PostgresAuditSinkOptions {
  /**
   * Destination table, optionally schema-qualified (e.g. `audit.audit_log`).
   * Default `'audit_log'`. Validated as a safe SQL identifier.
   */
  table?: string;
}

/** Allows `table` or `schema.table` made of unquoted SQL identifiers only. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

function assertSafeTable(table: string): string {
  if (!SAFE_IDENTIFIER.test(table)) {
    throw new Error(
      `Invalid audit table name "${table}". ` +
        'Use an unquoted identifier like "audit_log" or "schema.audit_log".',
    );
  }
  return table;
}

/**
 * SQL to create the audit table. Run once in a migration.
 *
 * @param table - Table name (validated). Default `'audit_log'`.
 */
export function createAuditTableSql(table = 'audit_log'): string {
  const name = assertSafeTable(table);
  return `CREATE TABLE IF NOT EXISTS ${name} (
  id              UUID        PRIMARY KEY,
  correlation_id  TEXT        NOT NULL,
  action          TEXT        NOT NULL,
  severity        TEXT        NOT NULL,
  outcome         TEXT        NOT NULL,
  actor           JSONB,
  request_kind    TEXT        NOT NULL,
  request_name    TEXT        NOT NULL,
  handler_name    TEXT        NOT NULL,
  payload         JSONB,
  response        JSONB,
  error           JSONB,
  duration_ms     DOUBLE PRECISION NOT NULL,
  metadata        JSONB,
  occurred_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);`;
}

/**
 * {@link AuditSink} backed by **Postgres** (`pg`) — a drop-in replacement for
 * the console sink. Inserts each audit record as a row.
 *
 * Create the table once with {@link createAuditTableSql}. The table name is
 * validated as a plain SQL identifier (it is interpolated, not parameterized);
 * all record values are passed as bound parameters.
 *
 * @example
 * ```ts
 * import { Pool } from 'pg';
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * await pool.query(createAuditTableSql());
 * const sink = new PostgresAuditSink(pool);
 * ```
 */
export class PostgresAuditSink implements AuditSink {
  private readonly table: string;
  private readonly insertSql: string;

  constructor(
    private readonly db: PostgresQueryableLike,
    options: PostgresAuditSinkOptions = {},
  ) {
    this.table = assertSafeTable(options.table ?? 'audit_log');
    this.insertSql = `INSERT INTO ${this.table}
      (id, correlation_id, action, severity, outcome, actor, request_kind,
       request_name, handler_name, payload, response, error, duration_ms,
       metadata, occurred_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`;
  }

  async write(record: AuditRecord): Promise<void> {
    await this.db.query(this.insertSql, [
      record.id,
      record.correlationId,
      record.action,
      record.severity,
      record.outcome,
      record.actor ? stringifyAuditValue(record.actor) : null,
      record.requestKind,
      record.requestName,
      record.handlerName,
      record.payload === undefined ? null : stringifyAuditValue(record.payload),
      record.response === undefined
        ? null
        : stringifyAuditValue(record.response),
      record.error ? stringifyAuditValue(record.error) : null,
      record.durationMs,
      record.metadata ? stringifyAuditValue(record.metadata) : null,
      record.timestamp,
    ]);
  }
}
