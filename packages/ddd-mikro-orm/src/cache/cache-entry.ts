/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { isSqlIdentifier } from '../helpers/sql-identifier.js';

/**
 * One row of the {@link MikroOrmCache} table.
 *
 * `value` holds the JSON-serialized snapshot, or `''` after an invalidation;
 * `expiresAt` is epoch milliseconds, or `null` for no expiry; `revision` is the
 * decimal revision token that fences concurrent fills.
 */
export class CacheEntry {
  key!: string;
  value!: string;
  expiresAt!: number | null;
  revision!: string;
}

function assertSafeTable(table: string): string {
  if (!isSqlIdentifier(table, { qualified: true })) {
    throw new Error(
      `Invalid cache table name "${table}". ` +
        'Use an unquoted identifier like "cache" or "schema.cache".',
    );
  }
  return table;
}

/**
 * SQL that creates the {@link MikroOrmCache} table and its expiry index, for
 * PostgreSQL and SQLite. Run it once in a migration. It matches
 * {@link createCacheEntrySchema} for the same `table`.
 *
 * It returns two statements, separated by `;`. The table name is validated as a
 * plain SQL identifier, because it is interpolated, not parameterized.
 *
 * @param table - Table name, optionally schema-qualified. Default `'cache'`.
 *
 * @example
 * ```ts
 * await orm.em.getConnection().execute(createCacheTableSql());
 * ```
 */
export function createCacheTableSql(table = 'cache'): string {
  const name = assertSafeTable(table);
  const index = `${name.slice(name.lastIndexOf('.') + 1)}_expires_at_idx`;
  return `CREATE TABLE IF NOT EXISTS ${name} (
  key         VARCHAR(255) NOT NULL PRIMARY KEY,
  value       TEXT         NOT NULL,
  expires_at  BIGINT,
  revision    BIGINT       NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ${index} ON ${name} (expires_at);`;
}

/**
 * MikroORM entity schema for {@link CacheEntry}. Register it with the ORM that
 * backs {@link MikroOrmCache}; pass `table` when the table is not named `cache`.
 *
 * `expires_at` is a `bigint` column, because epoch milliseconds overflow a
 * 32-bit integer.
 *
 * @param table - Table name, optionally schema-qualified. Default `'cache'`.
 */
export function createCacheEntrySchema(
  table = 'cache',
): EntitySchema<CacheEntry> {
  const safe = assertSafeTable(table);
  const index = `${safe.slice(safe.lastIndexOf('.') + 1)}_expires_at_idx`;
  return new EntitySchema<CacheEntry>({
    class: CacheEntry,
    tableName: safe,
    properties: {
      key: { type: 'string', length: 255, primary: true },
      value: { type: 'text' },
      expiresAt: {
        type: 'number',
        columnType: 'bigint',
        fieldName: 'expires_at',
        nullable: true,
      },
      revision: { type: 'bigint', fieldName: 'revision', default: 0 },
    },
    indexes: [
      {
        name: index,
        properties: ['expiresAt'],
      },
    ],
  });
}

/** {@link createCacheEntrySchema} for the default `cache` table. */
export const CacheEntrySchema = createCacheEntrySchema();
