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

import type { IdempotencyRecord } from '../interfaces/idempotency-record.interface';
import type { IdempotencyStore } from '../interfaces/idempotency-store.interface';

/** A single returned row, keyed by column name. */
export interface PostgresRowLike {
  [column: string]: unknown;
}

/** Minimal structural shape of a `pg` query result. */
export interface PostgresQueryResultLike {
  rows: PostgresRowLike[];
  rowCount?: number | null;
}

/**
 * Minimal structural shape of a `pg` `Pool` / `Client`. Declared locally so this
 * package does not hard-depend on `pg` — a real `Pool` or `Client` satisfies it.
 * Add it in your app: `pnpm add pg`.
 */
export interface PostgresQueryableLike {
  query(text: string, values?: unknown[]): Promise<PostgresQueryResultLike>;
}

/** Options for {@link PostgresIdempotencyStore}. */
export interface PostgresIdempotencyStoreOptions {
  /**
   * Destination table, optionally schema-qualified (e.g. `app.idempotency_keys`).
   * Default `'idempotency_keys'`. Validated as a safe SQL identifier.
   */
  table?: string;
}

/** Allows `table` or `schema.table` made of unquoted SQL identifiers only. */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

function assertSafeTable(table: string): string {
  if (!SAFE_IDENTIFIER.test(table)) {
    throw new Error(
      `Invalid idempotency table name "${table}". ` +
        'Use an unquoted identifier like "idempotency_keys" or "schema.idempotency_keys".',
    );
  }
  return table;
}

/**
 * SQL to create the idempotency table. Run once in a migration.
 *
 * @param table - Table name (validated). Default `'idempotency_keys'`.
 */
export function createIdempotencyTableSql(table = 'idempotency_keys'): string {
  const name = assertSafeTable(table);
  return `CREATE TABLE IF NOT EXISTS ${name} (
  key           TEXT        PRIMARY KEY,
  status        TEXT        NOT NULL,
  request_name  TEXT        NOT NULL,
  fingerprint   TEXT,
  response      JSONB,
  created_at    TIMESTAMPTZ NOT NULL,
  completed_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS ${indexName(name)} ON ${name} (expires_at);`;
}

/** Derives a safe index name from a (possibly schema-qualified) table name. */
function indexName(table: string): string {
  const base = table.includes('.') ? (table.split('.').pop() as string) : table;
  return `${base}_expires_at_idx`;
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function mapRow(key: string, row: PostgresRowLike): IdempotencyRecord {
  return {
    key,
    status: row.status as IdempotencyRecord['status'],
    requestName: row.request_name as string,
    fingerprint: (row.fingerprint as string | null) ?? undefined,
    response: row.response ?? undefined,
    createdAt: toIso(row.created_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : undefined,
  };
}

/**
 * {@link IdempotencyStore} backed by **Postgres** (`pg`) — a drop-in
 * replacement that shares state across instances without a separate Redis.
 *
 * Create the table once with {@link createIdempotencyTableSql}. Atomicity of
 * {@link setIfAbsent} comes from `INSERT … ON CONFLICT (key) DO NOTHING`: a CTE
 * first purges an expired row for the key, then the insert claims it only if no
 * live row exists. The table name is validated as a plain SQL identifier (it is
 * interpolated, not parameterized); all values are passed as bound parameters.
 *
 * @example
 * ```ts
 * import { Pool } from 'pg';
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * await pool.query(createIdempotencyTableSql());
 * const store = new PostgresIdempotencyStore(pool);
 * ```
 */
export class PostgresIdempotencyStore implements IdempotencyStore {
  private readonly table: string;

  constructor(
    private readonly db: PostgresQueryableLike,
    options: PostgresIdempotencyStoreOptions = {},
  ) {
    this.table = assertSafeTable(options.table ?? 'idempotency_keys');
  }

  async get(key: string): Promise<IdempotencyRecord | undefined> {
    const result = await this.db.query(
      `SELECT status, request_name, fingerprint, response, created_at, completed_at
         FROM ${this.table}
        WHERE key = $1 AND expires_at > now()`,
      [key],
    );
    const row = result.rows[0];
    return row ? mapRow(key, row) : undefined;
  }

  async setIfAbsent(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.db.query(
      `WITH purged AS (
         DELETE FROM ${this.table} WHERE key = $1 AND expires_at <= now()
       )
       INSERT INTO ${this.table}
         (key, status, request_name, fingerprint, response, created_at, completed_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (key) DO NOTHING
       RETURNING key`,
      this.toValues(key, record, ttlMs),
    );
    return result.rows.length > 0;
  }

  async set(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO ${this.table}
         (key, status, request_name, fingerprint, response, created_at, completed_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (key) DO UPDATE SET
         status = EXCLUDED.status,
         response = EXCLUDED.response,
         completed_at = EXCLUDED.completed_at,
         expires_at = EXCLUDED.expires_at`,
      this.toValues(key, record, ttlMs),
    );
  }

  async delete(key: string): Promise<void> {
    await this.db.query(`DELETE FROM ${this.table} WHERE key = $1`, [key]);
  }

  private toValues(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): unknown[] {
    return [
      key,
      record.status,
      record.requestName,
      record.fingerprint ?? null,
      record.response === undefined ? null : JSON.stringify(record.response),
      record.createdAt,
      record.completedAt ?? null,
      new Date(Date.now() + ttlMs).toISOString(),
    ];
  }
}
