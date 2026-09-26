/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { toPostgresJson } from '@nestjs-pipeline/core';
import { stringifyAuditValue } from '../helpers/json';
import type {
  AuditRecord,
  AuditStartRecord,
} from '../interfaces/audit-record.interface';
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
 * A row whose `outcome` is `'pending'` is an operation that started and has no
 * final record: `duration_ms` and `completed_at` stay null. An old pending row
 * marks an attempt interrupted by a process stop, whose outcome is unknown:
 *
 * ```sql
 * SELECT * FROM audit_log
 * WHERE outcome = 'pending' AND occurred_at < now() - interval '1 hour';
 * ```
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
  duration_ms     DOUBLE PRECISION,
  metadata        JSONB,
  occurred_at     TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ
);`;
}

/**
 * {@link AuditSink} backed by **Postgres** (`pg`) — a drop-in replacement for
 * the console sink. {@link begin} inserts a pending row when an operation
 * starts, and {@link write} completes it under the same id (or inserts it, when
 * no pending row exists), so an operation interrupted by a process stop stays
 * visible as `'pending'`.
 *
 * Create the table once with {@link createAuditTableSql}. The table name is
 * validated as a plain SQL identifier (it is interpolated, not parameterized);
 * all record values are passed as bound parameters. A NUL character or a lone
 * surrogate, which `jsonb` rejects, is stored as U+FFFD (see
 * `toPostgresJson`), so one such character cannot lose the whole record.
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
  private readonly beginSql: string;
  private readonly writeSql: string;

  constructor(
    private readonly db: PostgresQueryableLike,
    options: PostgresAuditSinkOptions = {},
  ) {
    const table = assertSafeTable(options.table ?? 'audit_log');
    const columns = `(id, correlation_id, action, severity, outcome, actor, request_kind,
       request_name, handler_name, payload, response, error, duration_ms,
       metadata, occurred_at, completed_at)`;
    this.beginSql = `INSERT INTO ${table} ${columns}
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NULL)`;
    this.writeSql = `INSERT INTO ${table} ${columns}
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, now())
      ON CONFLICT (id) DO UPDATE SET
        outcome = EXCLUDED.outcome,
        actor = EXCLUDED.actor,
        payload = EXCLUDED.payload,
        response = EXCLUDED.response,
        error = EXCLUDED.error,
        duration_ms = EXCLUDED.duration_ms,
        metadata = EXCLUDED.metadata,
        completed_at = EXCLUDED.completed_at`;
  }

  /** Inserts the pending row of an operation about to run. */
  async begin(record: AuditStartRecord): Promise<void> {
    await this.db.query(this.beginSql, this.values(record));
  }

  /**
   * Inserts the final row, or completes the pending row that {@link begin}
   * inserted under the same id.
   */
  async write(record: AuditRecord): Promise<void> {
    await this.db.query(this.writeSql, this.values(record));
  }

  private values(record: AuditRecord | AuditStartRecord): unknown[] {
    const json = (value: unknown) => toPostgresJson(stringifyAuditValue(value));
    const metadata =
      record.metadata || record.tenantId
        ? {
            ...(record.metadata ?? {}),
            ...(record.tenantId ? { tenantId: record.tenantId } : {}),
          }
        : null;
    const final = record.outcome === 'pending' ? undefined : record;

    return [
      record.id,
      record.correlationId,
      record.action,
      record.severity,
      record.outcome,
      record.actor ? json(record.actor) : null,
      record.requestKind,
      record.requestName,
      record.handlerName,
      record.payload === undefined ? null : json(record.payload),
      final?.response === undefined ? null : json(final.response),
      final?.error ? json(final.error) : null,
      final?.durationMs ?? null,
      metadata ? json(metadata) : null,
      record.timestamp,
    ];
  }
}
