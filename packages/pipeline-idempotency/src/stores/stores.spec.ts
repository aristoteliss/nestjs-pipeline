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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdempotencyRecord } from '../interfaces/idempotency-record.interface';
import { MemoryIdempotencyStore } from './memory.store';
import {
  createIdempotencyTableSql,
  PostgresIdempotencyStore,
  type PostgresQueryableLike,
} from './postgres.store';
import { type RedisClientLike, RedisIdempotencyStore } from './redis.store';

const record = (
  overrides: Partial<IdempotencyRecord> = {},
): IdempotencyRecord => ({
  key: 'k1',
  status: 'in_progress',
  requestName: 'CreateOrderCommand',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

// ─── Memory ─────────────────────────────────────────────────────────────────

describe('MemoryIdempotencyStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('claims a key once, then rejects further claims', () => {
    const store = new MemoryIdempotencyStore();
    expect(store.setIfAbsent('k1', record(), 1000)).toBe(true);
    expect(store.setIfAbsent('k1', record(), 1000)).toBe(false);
  });

  it('expires keys after the TTL window', () => {
    const store = new MemoryIdempotencyStore();
    store.setIfAbsent('k1', record(), 1000);

    vi.advanceTimersByTime(1001);

    expect(store.get('k1')).toBeUndefined();
    expect(store.setIfAbsent('k1', record(), 1000)).toBe(true);
  });

  it('deletes a key so it can be reclaimed', () => {
    const store = new MemoryIdempotencyStore();
    store.setIfAbsent('k1', record(), 1000);
    store.delete('k1');
    expect(store.get('k1')).toBeUndefined();
    expect(store.setIfAbsent('k1', record(), 1000)).toBe(true);
  });

  it('overwrites with set', () => {
    const store = new MemoryIdempotencyStore();
    store.setIfAbsent('k1', record(), 1000);
    store.set(
      'k1',
      record({ status: 'completed', response: { ok: true } }),
      1000,
    );
    expect(store.get('k1')?.status).toBe('completed');
  });
});

// ─── Redis ──────────────────────────────────────────────────────────────────

describe('RedisIdempotencyStore', () => {
  it('claims via SET NX PX and prefixes keys', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const client: RedisClientLike = {
      get: vi.fn(),
      set,
      del: vi.fn(),
    };
    const store = new RedisIdempotencyStore(client);

    const claimed = await store.setIfAbsent('k1', record(), 5000);

    expect(claimed).toBe(true);
    expect(set).toHaveBeenCalledWith('idempotency:k1', expect.any(String), {
      PX: 5000,
      NX: true,
    });
  });

  it('reports a lost claim when SET NX returns null', async () => {
    const client: RedisClientLike = {
      get: vi.fn(),
      set: vi.fn().mockResolvedValue(null),
      del: vi.fn(),
    };
    const store = new RedisIdempotencyStore(client);
    expect(await store.setIfAbsent('k1', record(), 5000)).toBe(false);
  });

  it('parses a stored JSON record', async () => {
    const stored = record({ status: 'completed', response: { id: 'x' } });
    const client: RedisClientLike = {
      get: vi.fn().mockResolvedValue(JSON.stringify(stored)),
      set: vi.fn(),
      del: vi.fn(),
    };
    const store = new RedisIdempotencyStore(client, { keyPrefix: 'idem:' });

    expect(await store.get('k1')).toEqual(stored);
    expect(client.get).toHaveBeenCalledWith('idem:k1');
  });

  it('returns undefined for a missing key', async () => {
    const client: RedisClientLike = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
      del: vi.fn(),
    };
    const store = new RedisIdempotencyStore(client);
    expect(await store.get('missing')).toBeUndefined();
  });
});

// ─── Postgres ─────────────────────────────────────────────────────────────────

describe('PostgresIdempotencyStore', () => {
  it('claims a key when the insert returns a row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ key: 'k1' }] });
    const db: PostgresQueryableLike = { query };
    const store = new PostgresIdempotencyStore(db);

    expect(await store.setIfAbsent('k1', record(), 5000)).toBe(true);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (key) DO NOTHING');
  });

  it('reports a lost claim when no row is returned', async () => {
    const db: PostgresQueryableLike = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
    };
    const store = new PostgresIdempotencyStore(db);
    expect(await store.setIfAbsent('k1', record(), 5000)).toBe(false);
  });

  it('maps a selected row into a record', async () => {
    const db: PostgresQueryableLike = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            status: 'completed',
            request_name: 'CreateOrderCommand',
            fingerprint: 'abc',
            response: { id: 'x' },
            created_at: '2026-01-01T00:00:00.000Z',
            completed_at: '2026-01-01T00:00:01.000Z',
          },
        ],
      }),
    };
    const store = new PostgresIdempotencyStore(db);

    expect(await store.get('k1')).toEqual({
      key: 'k1',
      status: 'completed',
      requestName: 'CreateOrderCommand',
      fingerprint: 'abc',
      response: { id: 'x' },
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
    });
  });

  it('emits a CREATE TABLE statement for the default table', () => {
    const sql = createIdempotencyTableSql();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS idempotency_keys');
    expect(sql).toContain('key           TEXT        PRIMARY KEY');
  });

  it('rejects an unsafe table name', () => {
    expect(() => createIdempotencyTableSql('keys; DROP TABLE x')).toThrow();
    expect(
      () => new PostgresIdempotencyStore({ query: vi.fn() }, { table: '1bad' }),
    ).toThrow();
  });
});
