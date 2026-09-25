/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import {
  CacheEntry,
  CacheEntrySchema,
  createCacheEntrySchema,
  createCacheTableSql,
} from './cache-entry';

describe('cache entry schema', () => {
  it('maps CacheEntry to the cache table by default', () => {
    expect(CacheEntrySchema.meta.class).toBe(CacheEntry);
    expect(CacheEntrySchema.meta.tableName).toBe('cache');
  });

  it('stores expiry as bigint, because epoch milliseconds overflow a 32-bit integer', () => {
    expect(CacheEntrySchema.meta.properties.expiresAt).toMatchObject({
      columnType: 'bigint',
      fieldName: 'expires_at',
      nullable: true,
    });
  });

  it.each(['app_cache', 'caching.entries'])(
    'accepts the table name %s',
    (table) => {
      expect(createCacheEntrySchema(table).meta.tableName).toBe(table);
    },
  );

  it.each(['cache; drop table users', '"cache"', 'a.b.c', '1cache', ''])(
    'rejects the unsafe table name %j',
    (table) => {
      expect(() => createCacheEntrySchema(table)).toThrow(
        /Invalid cache table name/,
      );
    },
  );
});

describe('createCacheTableSql', () => {
  it('creates the default table with the columns the schema maps, and its expiry index', () => {
    expect(createCacheTableSql()).toBe(`CREATE TABLE IF NOT EXISTS cache (
  key         VARCHAR(255) NOT NULL PRIMARY KEY,
  value       TEXT         NOT NULL,
  expires_at  BIGINT,
  revision    BIGINT       NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS cache_expires_at_idx ON cache (expires_at);`);
  });

  it('names the index after the table, without its schema', () => {
    const sql = createCacheTableSql('caching.entries');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS caching.entries (');
    expect(sql).toContain(
      'CREATE INDEX IF NOT EXISTS entries_expires_at_idx ON caching.entries (expires_at);',
    );
  });

  it('rejects an unsafe table name', () => {
    expect(() => createCacheTableSql('cache; drop table users')).toThrow(
      /Invalid cache table name/,
    );
  });
});
