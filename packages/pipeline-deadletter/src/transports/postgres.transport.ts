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

import type {
  DeadLetterRecord,
  DeadLetterTransport,
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
  id              BIGSERIAL PRIMARY KEY,
  correlation_id  TEXT        NOT NULL,
  request_kind    TEXT        NOT NULL,
  request_name    TEXT        NOT NULL,
  handler_name    TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  error           JSONB       NOT NULL,
  metadata        JSONB,
  failed_at       TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);`;
}

/**
 * {@link DeadLetterTransport} backed by **Postgres** (`pg`) — a drop-in
 * replacement for the BullMQ transport. Inserts each dead letter as a row.
 *
 * Create the table once with {@link createDeadLetterTableSql}. The table name is
 * validated as a plain SQL identifier (it is interpolated, not parameterized);
 * all record values are passed as bound parameters.
 *
 * @example
 * ```ts
 * import { Pool } from 'pg';
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * await pool.query(createDeadLetterTableSql());
 * const transport = new PostgresDeadLetterTransport(pool);
 * ```
 */
export class PostgresDeadLetterTransport implements DeadLetterTransport {
  private readonly table: string;
  private readonly insertSql: string;

  constructor(
    private readonly db: PostgresQueryableLike,
    options: PostgresDeadLetterTransportOptions = {},
  ) {
    this.table = assertSafeTable(options.table ?? 'dead_letters');
    this.insertSql = `INSERT INTO ${this.table}
      (correlation_id, request_kind, request_name, handler_name, payload, error, metadata, failed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;
  }

  async send(record: DeadLetterRecord): Promise<void> {
    await this.db.query(this.insertSql, [
      record.correlationId,
      record.requestKind,
      record.requestName,
      record.handlerName,
      JSON.stringify(record.payload ?? null),
      JSON.stringify(record.error),
      record.metadata ? JSON.stringify(record.metadata) : null,
      record.failedAt,
    ]);
  }
}
