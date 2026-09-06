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

const COMPLETE_IF_OWNED_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, current = pcall(cjson.decode, raw)
if not ok then return 0 end
if current.status ~= 'in_progress' or current.claimId ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
return 1
`;

const DELETE_IF_OWNED_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, current = pcall(cjson.decode, raw)
if not ok then return 0 end
if current.claimId ~= ARGV[1] then return 0 end
return redis.call('DEL', KEYS[1])
`;

/**
 * Minimal structural shape of a `redis` (node-redis v4) client. Declared
 * locally so this package does not hard-depend on `redis` — a real client
 * satisfies it. Add it in your app: `pnpm add redis`.
 *
 * `set` must support the `NX` (set-if-absent) and `PX` (ms TTL) options and
 * return `null` when `NX` prevented the write. `eval` is used for atomic
 * owner-aware completion/release transitions.
 */
export interface RedisClientLike {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    options?: { PX?: number; NX?: boolean },
  ): Promise<string | null>;
  del(key: string): Promise<number>;
  eval(
    script: string,
    options: { keys: string[]; arguments: string[] },
  ): Promise<unknown>;
}

/** Options for {@link RedisIdempotencyStore}. */
export interface RedisIdempotencyStoreOptions {
  /** Prefix applied to every Redis key. Default `'idempotency:'`. */
  keyPrefix?: string;
}

/**
 * {@link IdempotencyStore} backed by **Redis** (node-redis v4) — a drop-in
 * replacement for the memory store that shares state across instances.
 *
 * Atomicity comes from Redis itself: {@link setIfAbsent} issues
 * `SET key value PX <ttl> NX`, which sets the key only if it does not already
 * exist and returns `null` otherwise. Owner-aware completion and release use
 * Lua scripts so a stale execution cannot overwrite/delete a newer claim.
 * TTL is enforced by Redis, so expired keys never linger.
 *
 * @example
 * ```ts
 * import { createClient } from 'redis';
 * const client = createClient({ url: process.env.REDIS_URL });
 * await client.connect();
 * const store = new RedisIdempotencyStore(client);
 * ```
 */
export class RedisIdempotencyStore implements IdempotencyStore {
  private readonly prefix: string;

  constructor(
    private readonly client: RedisClientLike,
    options: RedisIdempotencyStoreOptions = {},
  ) {
    this.prefix = options.keyPrefix ?? 'idempotency:';
  }

  async get(key: string): Promise<IdempotencyRecord | undefined> {
    const raw = await this.client.get(this.prefix + key);
    return raw ? (JSON.parse(raw) as IdempotencyRecord) : undefined;
  }

  async setIfAbsent(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.client.set(
      this.prefix + key,
      JSON.stringify(record),
      { PX: ttlMs, NX: true },
    );
    return result !== null;
  }

  async completeIfOwned(
    key: string,
    claimId: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): Promise<boolean> {
    const result = await this.client.eval(COMPLETE_IF_OWNED_SCRIPT, {
      keys: [this.prefix + key],
      arguments: [claimId, JSON.stringify(record), String(ttlMs)],
    });
    return Number(result) === 1;
  }

  async deleteIfOwned(key: string, claimId: string): Promise<boolean> {
    const result = await this.client.eval(DELETE_IF_OWNED_SCRIPT, {
      keys: [this.prefix + key],
      arguments: [claimId],
    });
    return Number(result) === 1;
  }

  async set(
    key: string,
    record: IdempotencyRecord,
    ttlMs: number,
  ): Promise<void> {
    await this.client.set(this.prefix + key, JSON.stringify(record), {
      PX: ttlMs,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.del(this.prefix + key);
  }
}
