/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { toPostgresJson } from '@nestjs-pipeline/core';
import type {
  DeadLetterError,
  DeadLetterListFilter,
  DeadLetterRecord,
  DeadLetterStore,
} from '../interfaces/dead-letter-transport.interface';

/**
 * Minimal structural shape of a `pg` `Pool` / `Client`. Declared locally so this
 * package does not hard-depend on `pg` — a real `Pool` or `Client` satisfies it.
 * Add it in your app: `pnpm add pg`.
 */
export interface PostgresQueryableLike {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

/** Options for {@link PostgresDeadLetterTransport}. */
export interface PostgresDeadLetterTransportOptions {
  /**
   * Destination table, optionally schema-qualified (e.g. `audit.dead_letters`).
   * Default `'dead_letters'`. Validated as a safe SQL identifier.
   */
  table?: string;
}

/** Allows `table` or `schema.table` made of unquoted SQL identifiers only. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

function assertSafeTable(table: string): string {
  if (!SAFE_IDENTIFIER.test(table)) {
    throw new Error(
      `Invalid dead-letter table name "${table}". ` +
        'Use an unquoted identifier like "dead_letters" or "schema.dead_letters".',
    );
  }
  return table;
}

/**
 * SQL to create the dead-letter table. Run once in a migration.
 *
 * @param table - Table name (validated). Default `'dead_letters'`.
 */
export function createDeadLetterTableSql(table = 'dead_letters'): string {
  const name = assertSafeTable(table);
  return `CREATE TABLE IF NOT EXISTS ${name} (
  id              UUID        PRIMARY KEY,
  correlation_id  TEXT        NOT NULL,
  request_kind    TEXT        NOT NULL,
  request_name    TEXT        NOT NULL,
  handler_name    TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  error           JSONB       NOT NULL,
  metadata        JSONB,
  failed_at       TIMESTAMPTZ NOT NULL,
  attempts        INTEGER     NOT NULL DEFAULT 0,
  status          TEXT        NOT NULL DEFAULT 'open',
  payload_redacted BOOLEAN    NOT NULL DEFAULT false,
  last_error      JSONB,
  resolved_at     TIMESTAMPTZ
);`;
}

/**
 * {@link DeadLetterStore} backed by **Postgres** (`pg`): inserts each dead
 * letter as a row and keeps it, so it can be listed, redriven with
 * `DeadLetterRedriver`, and resolved. Create the table once with
 * {@link createDeadLetterTableSql}.
 *
 * The table name is validated as a plain SQL identifier (it is interpolated,
 * not parameterized); all values are bound parameters.
 *
 * @example
 * ```ts
 * await pool.query(createDeadLetterTableSql());
 * const store = new PostgresDeadLetterTransport(pool);
 * const open = await store.list({ status: 'open' });
 * ```
 */
export class PostgresDeadLetterTransport implements DeadLetterStore {
  private readonly table: string;

  constructor(
    private readonly db: PostgresQueryableLike,
    options: PostgresDeadLetterTransportOptions = {},
  ) {
    this.table = assertSafeTable(options.table ?? 'dead_letters');
  }

  async send(record: DeadLetterRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO ${this.table}
        (id, correlation_id, request_kind, request_name, handler_name, payload,
         error, metadata, failed_at, attempts, status, payload_redacted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        record.id,
        record.correlationId,
        record.requestKind,
        record.requestName,
        record.handlerName,
        json(record.payload ?? null),
        json(record.error),
        record.metadata ? json(record.metadata) : null,
        record.failedAt,
        record.attempts,
        record.status,
        record.payloadRedacted,
      ],
    );
  }

  async get(id: string): Promise<DeadLetterRecord | undefined> {
    const rows = await this.rows(`SELECT * FROM ${this.table} WHERE id = $1`, [
      id,
    ]);
    return rows[0];
  }

  async list(filter: DeadLetterListFilter = {}): Promise<DeadLetterRecord[]> {
    return this.rows(
      `SELECT * FROM ${this.table}
        WHERE ($1::text IS NULL OR status = $1)
          AND ($2::text IS NULL OR request_name = $2)
        ORDER BY id
        LIMIT $3`,
      [filter.status ?? null, filter.requestName ?? null, filter.limit ?? 100],
    );
  }

  async recordAttempt(id: string, error: DeadLetterError): Promise<void> {
    await this.db.query(
      `UPDATE ${this.table} SET attempts = attempts + 1, last_error = $2 WHERE id = $1`,
      [id, json(error)],
    );
  }

  async markResolved(id: string): Promise<void> {
    await this.db.query(
      `UPDATE ${this.table} SET status = 'resolved', resolved_at = now() WHERE id = $1`,
      [id],
    );
  }

  private async rows(
    sql: string,
    values: unknown[],
  ): Promise<DeadLetterRecord[]> {
    const result = (await this.db.query(sql, values)) as {
      rows?: DeadLetterRow[];
    };
    return (result.rows ?? []).map(toRecord);
  }
}

interface DeadLetterRow {
  id: string;
  correlation_id: string;
  request_kind: DeadLetterRecord['requestKind'];
  request_name: string;
  handler_name: string;
  payload: unknown;
  error: DeadLetterError;
  metadata: Record<string, unknown> | null;
  failed_at: Date;
  attempts: number;
  status: DeadLetterRecord['status'];
  payload_redacted: boolean;
  last_error: DeadLetterError | null;
  resolved_at: Date | null;
}

function json(value: unknown): string {
  return toPostgresJson(JSON.stringify(value));
}

function toRecord(row: DeadLetterRow): DeadLetterRecord {
  const tenantId = row.metadata?.tenantId;
  return {
    id: row.id,
    correlationId: row.correlation_id,
    ...(typeof tenantId === 'string' ? { tenantId } : {}),
    requestKind: row.request_kind,
    requestName: row.request_name,
    handlerName: row.handler_name,
    payload: row.payload,
    error: row.error,
    failedAt: row.failed_at.toISOString(),
    ...(row.metadata ? { metadata: row.metadata } : {}),
    attempts: row.attempts,
    status: row.status,
    payloadRedacted: row.payload_redacted,
    ...(row.last_error ? { lastError: row.last_error } : {}),
    ...(row.resolved_at ? { resolvedAt: row.resolved_at.toISOString() } : {}),
  };
}
