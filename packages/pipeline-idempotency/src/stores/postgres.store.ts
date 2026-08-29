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
  IdempotencyRecord,
  JsonValue,
} from '../interfaces/idempotency-record.interface';
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
 * SQL to create/upgrade the idempotency table. Run once in a migration.
 *
 * `claim_id` is added with `IF NOT EXISTS` as well so installations created by
 * an older package version can adopt owner-aware completion without dropping
 * existing records.
 *
 * @param table - Table name (validated). Default `'idempotency_keys'`.
 */
export function createIdempotencyTableSql(table = 'idempotency_keys'): string {
  const name = assertSafeTable(table);
  return `CREATE TABLE IF NOT EXISTS ${name} (
  key           TEXT        PRIMARY KEY,
  status        TEXT        NOT NULL,
  request_name  TEXT        NOT NULL,
  claim_id      TEXT,
  fingerprint   TEXT,
  response      JSONB,
  created_at    TIMESTAMPTZ NOT NULL,
  completed_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL
);
ALTER TABLE ${name} ADD COLUMN IF NOT EXISTS claim_id TEXT;
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
    claimId: (row.claim_id as string | null) ?? undefined,
    fingerprint: (row.fingerprint as string | null) ?? undefined,
    // SQL NULL → has_response=false → undefined (no response stored).
    // JSONB null → has_response=true, row.response=null → null (explicit null).
    response: row.has_response ? (row.response as JsonValue) : undefined,
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
 * live row exists. Completion/release also compare `claim_id` in the same SQL
 * statement, so a stale execution cannot mutate a newer claim. The table name
 * is validated as a plain SQL identifier (it is interpolated, not parameterized);
 * all values are passed as bound parameters.
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
      `SELECT status, request_name, claim_id, fingerprint, response,
              response IS NOT NULL AS has_response,
              created_at, completed_at
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
         (key, status, request_name, claim_id, fingerprint, response, created_at, completed_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (key) DO NOTHING
       RETURNING key`,
      this.toValues(key, record, ttlMs),
    );
    return result.rows.length > 0;
  }

  async completeIfOwned(
    key: string,
    claimId: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.db.query(
      `UPDATE ${this.table}
          SET status = $3,
              request_name = $4,
              claim_id = $5,
              fingerprint = $6,
              response = $7,
              created_at = $8,
              completed_at = $9,
              expires_at = $10
        WHERE key = $1
          AND claim_id = $2
          AND status = 'in_progress'
          AND expires_at > now()
        RETURNING key`,
      [
        key,
        claimId,
        record.status,
        record.requestName,
        record.claimId ?? null,
        record.fingerprint ?? null,
        record.response === undefined ? null : JSON.stringify(record.response),
        record.createdAt,
        record.completedAt ?? null,
        new Date(Date.now() + ttlMs).toISOString(),
      ],
    );
    return result.rows.length > 0;
  }

  async deleteIfOwned(key: string, claimId: string): Promise<boolean> {
    const result = await this.db.query(
      `DELETE FROM ${this.table}
        WHERE key = $1
          AND claim_id = $2
          AND expires_at > now()
        RETURNING key`,
      [key, claimId],
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
         (key, status, request_name, claim_id, fingerprint, response, created_at, completed_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (key) DO UPDATE SET
         status = EXCLUDED.status,
         request_name = EXCLUDED.request_name,
         claim_id = EXCLUDED.claim_id,
         fingerprint = EXCLUDED.fingerprint,
         response = EXCLUDED.response,
         created_at = EXCLUDED.created_at,
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
      record.claimId ?? null,
      record.fingerprint ?? null,
      record.response === undefined ? null : JSON.stringify(record.response),
      record.createdAt,
      record.completedAt ?? null,
      new Date(Date.now() + ttlMs).toISOString(),
    ];
  }
}
