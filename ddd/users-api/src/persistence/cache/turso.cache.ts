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

import type { Client } from '@libsql/client';
import { Inject, Injectable } from '@nestjs/common';
import { ICache } from '@nestjs-pipeline/ddd-core';
import { TURSO_CLIENT } from '../turso-store';

export interface CacheSetOptions {
  /** Time-to-live in milliseconds. Omit for no expiry. */
  ttl?: number;
}

/**
 * TursoCache is a BACKUP/secondary cache implementation (ICache<T>), using libSQL.
 * MikroOrmCache is now the primary cache for the app.
 *
 * TTL: pass { ttl: <ms> } to set(). Expired entries are filtered on get().
 * No expiry: omit options or leave ttl undefined.
 */
@Injectable()
export class TursoCache<T> implements ICache<T> {
  constructor(@Inject(TURSO_CLIENT) private readonly client: Client) { }

  async get(key: string): Promise<T | undefined> {
    const result = await this.client.execute({
      sql: `SELECT value FROM cache WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)`,
      args: [key, Date.now()],
    });
    const row = result.rows[0];
    if (!row) return undefined;
    return JSON.parse(row.value as string) as T;
  }

  async set(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    const expiresAt = options?.ttl != null ? Date.now() + options.ttl : null;
    await this.client.execute({
      sql: `INSERT INTO cache (key, value, expires_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at`,
      args: [key, JSON.stringify(value), expiresAt],
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.execute({
      sql: `DELETE FROM cache WHERE key = ?`,
      args: [key],
    });
  }
}
