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
  },
});
