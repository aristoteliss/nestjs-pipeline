/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EntitySchema } from '@mikro-orm/core';
import { CacheEntry } from '../cache/cache.entity';

/**
 * MikroORM entity schema for the cache table.
 * Used by MikroOrmCache (primary cache layer).
 */
export const CacheSchema = new EntitySchema<CacheEntry>({
  class: CacheEntry,
  tableName: 'cache',
  properties: {
    key: { type: 'string', primary: true },
    value: { type: 'string' },
    expiresAt: { type: 'number', fieldName: 'expires_at', nullable: true },
    revision: { type: 'bigint', fieldName: 'revision', default: '0' },
  },
});
