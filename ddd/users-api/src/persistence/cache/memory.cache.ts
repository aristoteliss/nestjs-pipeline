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

import { Injectable } from '@nestjs/common';
import { CacheSetOptions, ICache } from '@nestjs-pipeline/ddd-core';

export const CACHE_TOKEN = Symbol('MemoryCache');

export type MemoryCacheSetOptions = CacheSetOptions;

@Injectable()
export class MemoryCache<T> implements ICache<T> {
  private store: Map<string, { value: T; expiresAt?: number }> = new Map();
  private readonly defaultTtlMs: number;

  constructor(options?: { defaultTtlMs?: number }) {
    this.defaultTtlMs = options?.defaultTtlMs ?? 60_000;
  }

  async set(
    key: string,
    value: T,
    options?: MemoryCacheSetOptions,
  ): Promise<void> {
    const existing = this.store.get(key);
    if (existing) {
      if (existing.expiresAt !== undefined && Date.now() > existing.expiresAt) {
        this.store.delete(key);
      } else if (options?.isNewer?.(existing.value, value)) {
        return;
      }
    }

    const ttl = options?.ttl ?? this.defaultTtlMs;
    const expiresAt = ttl > 0 ? Date.now() + ttl : undefined;
    this.store.set(key, { value, expiresAt });
  }

  async get(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
