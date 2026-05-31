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
import { ICache } from '@nestjs-pipeline/ddd-core';

export const CACHE_TOKEN = Symbol('MemoryCache');

@Injectable()
export class MemoryCache<T> implements ICache<T> {
  private store: Map<string, T> = new Map();

  async set(key: string, value: T): Promise<void> {
    this.store.set(key, value);
  }

  async get(key: string): Promise<T | undefined> {
    return this.store.get(key);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}
