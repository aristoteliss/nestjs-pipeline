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
  claimId: 'claim-1',
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

  it('completes a record only for the current claim owner', () => {
    const store = new MemoryIdempotencyStore();
    const claim = record({ claimId: 'owner-a' });
    store.setIfAbsent('k1', claim, 1000);

    expect(
      store.completeIfOwned(
        'k1',
        'owner-a',
        { ...claim, status: 'completed', response: 'ok' },
        1000,
      ),
    ).toBe(true);
    expect(store.get('k1')).toMatchObject({
      status: 'completed',
      claimId: 'owner-a',
      response: 'ok',
    });
  });

  it('stores JSON snapshots rather than retaining live response objects', () => {
    const store = new MemoryIdempotencyStore();
    const response = { completedAt: new Date('2026-01-01T00:00:00.000Z') };
    const completed = record({
      status: 'completed',
      response: response as never,
    });

    store.set('k1', completed, 1000);
    response.completedAt.setUTCFullYear(2030);

    expect(store.get('k1')?.response).toEqual({
      completedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('does not let a stale owner complete a newer reclaimed claim', () => {
    const store = new MemoryIdempotencyStore();
    const first = record({ claimId: 'owner-a' });
    store.setIfAbsent('k1', first, 1000);

    vi.advanceTimersByTime(1001);

    const second = record({ claimId: 'owner-b' });
    expect(store.setIfAbsent('k1', second, 1000)).toBe(true);

    expect(
      store.completeIfOwned(
        'k1',
        'owner-a',
        { ...first, status: 'completed', response: 'stale' },
        1000,
      ),
    ).toBe(false);
    expect(store.get('k1')).toEqual(second);
  });

  it('does not let a stale owner delete a newer reclaimed claim', () => {
    const store = new MemoryIdempotencyStore();
    store.setIfAbsent('k1', record({ claimId: 'owner-a' }), 1000);

    vi.advanceTimersByTime(1001);

    const second = record({ claimId: 'owner-b' });
    store.setIfAbsent('k1', second, 1000);

    expect(store.deleteIfOwned('k1', 'owner-a')).toBe(false);
    expect(store.get('k1')).toEqual(second);
    expect(store.deleteIfOwned('k1', 'owner-b')).toBe(true);
    expect(store.get('k1')).toBeUndefined();
  });

  it('periodically cleans up expired entries without requiring get() on keys', () => {
    const store = new MemoryIdempotencyStore({ cleanupIntervalMs: 5000 });
    try {
      for (let i = 0; i < 20; i++) {
        store.setIfAbsent(`key-${i}`, record({ key: `key-${i}` }), 2000);
      }
      expect(store.size).toBe(20);

      // Advance past TTL and trigger the periodic cleanup timer
      vi.advanceTimersByTime(5000);

      // All 20 expired keys have been purged from memory automatically
      expect(store.size).toBe(0);
    } finally {
      store.destroy();
    }
  });

  it('bounds capacity and handles sustained cardinality without unbounded memory growth when expired entries are pruned', () => {
    const maxEntries = 25;
    const store = new MemoryIdempotencyStore({
      maxEntries,
      cleanupIntervalMs: 0,
    });
    try {
      for (let i = 0; i < 100; i++) {
        // Advance time so older entries expire and get cleaned up on ensureCapacity
        vi.advanceTimersByTime(100);
        store.setIfAbsent(
          `cardinality-${i}`,
          record({ key: `cardinality-${i}` }),
          500,
        );
      }
      expect(store.size).toBeLessThanOrEqual(maxEntries);
    } finally {
      store.destroy();
    }
  });

  it('does not evict active in-progress claims when reaching capacity, preventing duplicate execution', () => {
    const store = new MemoryIdempotencyStore({ maxEntries: 1, cleanupIntervalMs: 0 });
    const claimA = record({ key: 'claim-a', claimId: 'owner-a', status: 'in_progress' });
    const claimB = record({ key: 'claim-b', claimId: 'owner-b', status: 'in_progress' });

    expect(store.setIfAbsent('claim-a', claimA, 10_000)).toBe(true);

    // Adding claim-b when capacity 1 is full of unexpired claim-a must reject and NOT evict claim-a
    expect(() => store.setIfAbsent('claim-b', claimB, 10_000)).toThrow(
      /capacity .* reached: cannot evict active or unexpired claims/,
    );

    // Claim A is still alive and owned
    expect(store.get('claim-a')).toBeDefined();
    // A duplicate claim A is rejected (not allowed to execute again)
    expect(store.setIfAbsent('claim-a', claimA, 10_000)).toBe(false);
  });

  it('does not evict completed unexpired claims when reaching capacity, preserving idempotency', () => {
    const store = new MemoryIdempotencyStore({ maxEntries: 1, cleanupIntervalMs: 0 });
    const claimA = record({ key: 'claim-a', claimId: 'owner-a', status: 'in_progress' });
    store.setIfAbsent('claim-a', claimA, 10_000);
    store.completeIfOwned(
      'claim-a',
      'owner-a',
      { ...claimA, status: 'completed', response: 'ok' },
      10_000,
    );

    const claimB = record({ key: 'claim-b', claimId: 'owner-b', status: 'in_progress' });
    // Attempting to claim B cannot evict completed unexpired claim A
    expect(() => store.setIfAbsent('claim-b', claimB, 10_000)).toThrow(
      /capacity .* reached: cannot evict active or unexpired claims/,
    );

    // Claim A still returns the completed record
    expect(store.get('claim-a')?.status).toBe('completed');
    // New duplicate claim A is rejected so it cannot execute twice
    expect(store.setIfAbsent('claim-a', claimA, 10_000)).toBe(false);
  });

  it('purges expired entries first before evicting live entries when reaching maxEntries', () => {
    const store = new MemoryIdempotencyStore({
      maxEntries: 5,
      cleanupIntervalMs: 0,
    });
    try {
      // 3 short-lived entries (1s) and 2 longer-lived entries (10s)
      for (let i = 0; i < 3; i++) {
        store.setIfAbsent(`short-${i}`, record({ key: `short-${i}` }), 1000);
      }
      for (let i = 0; i < 2; i++) {
        store.setIfAbsent(`long-${i}`, record({ key: `long-${i}` }), 10_000);
      }
      expect(store.size).toBe(5);

      // Advance past the 1s TTL of the short entries
      vi.advanceTimersByTime(1001);

      // Adding new entry triggers ensureCapacity() which purges the 3 expired short entries
      store.setIfAbsent('new-1', record({ key: 'new-1' }), 10_000);

      // Remaining should be 2 long-lived entries + 1 new entry = 3 entries
      expect(store.size).toBe(3);
      expect(store.get('long-0')).toBeDefined();
      expect(store.get('long-1')).toBeDefined();
      expect(store.get('new-1')).toBeDefined();
    } finally {
      store.destroy();
    }
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
      eval: vi.fn(),
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
      eval: vi.fn(),
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
      eval: vi.fn(),
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
      eval: vi.fn(),
    };
    const store = new RedisIdempotencyStore(client);
    expect(await store.get('missing')).toBeUndefined();
  });

  it('completes through an atomic owner-aware Lua script', async () => {
    const evalFn = vi.fn().mockResolvedValue(1);
    const client: RedisClientLike = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      eval: evalFn,
    };
    const store = new RedisIdempotencyStore(client);
    const completed = record({
      status: 'completed',
      claimId: 'owner-a',
      response: 'ok',
    });

    expect(await store.completeIfOwned('k1', 'owner-a', completed, 5000)).toBe(
      true,
    );
    expect(evalFn).toHaveBeenCalledWith(
      expect.stringContaining('current.claimId ~= ARGV[1]'),
      {
        keys: ['idempotency:k1'],
        arguments: ['owner-a', JSON.stringify(completed), '5000'],
      },
    );
  });

  it('reports lost ownership when the Redis CAS script returns zero', async () => {
    const client: RedisClientLike = {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      eval: vi.fn().mockResolvedValue(0),
    };
    const store = new RedisIdempotencyStore(client);

    expect(
      await store.completeIfOwned(
        'k1',
        'stale-owner',
        record({ status: 'completed', claimId: 'stale-owner' }),
        5000,
      ),
    ).toBe(false);
    expect(await store.deleteIfOwned('k1', 'stale-owner')).toBe(false);
  });
});

// ─── Postgres ────────────────────────────────────────────────────────────────

describe('PostgresIdempotencyStore', () => {
  it('claims or atomically reclaims an expired key when the upsert returns a row', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ key: 'k1' }] });
    const db: PostgresQueryableLike = { query };
    const store = new PostgresIdempotencyStore(db);

    expect(
      await store.setIfAbsent(
        'k1',
        record({ claimId: 'replacement-owner' }),
        5000,
      ),
    ).toBe(true);
    const [sql, values] = query.mock.calls[0];
    expect(sql).not.toContain('WITH purged');
    expect(sql).toContain('INSERT INTO idempotency_keys AS current_record');
    expect(sql).toContain('ON CONFLICT (key) DO UPDATE SET');
    expect(sql).toContain('claim_id = EXCLUDED.claim_id');
    expect(sql).toContain('WHERE current_record.expires_at <= now()');
    expect(sql).toContain('claim_id');
    expect(values[3]).toBe('replacement-owner');
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
            claim_id: 'owner-a',
            fingerprint: 'abc',
            response: { id: 'x' },
            has_response: true,
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
      claimId: 'owner-a',
      fingerprint: 'abc',
      response: { id: 'x' },
      createdAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
    });
  });

  it('preserves an explicit null response distinct from undefined', async () => {
    const db: PostgresQueryableLike = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            status: 'completed',
            request_name: 'VoidCommand',
            claim_id: 'owner-a',
            fingerprint: null,
            response: null,
            has_response: true,
            created_at: '2026-01-01T00:00:00.000Z',
            completed_at: '2026-01-01T00:00:01.000Z',
          },
        ],
      }),
    };
    const store = new PostgresIdempotencyStore(db);
    const result = await store.get('k1');

    // response: null must stay null, not become undefined
    expect(result).toBeDefined();
    expect(result!.response).toBeNull();
  });

  it('completes and deletes only when claim_id still matches', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ key: 'k1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const db: PostgresQueryableLike = { query };
    const store = new PostgresIdempotencyStore(db);

    expect(
      await store.completeIfOwned(
        'k1',
        'owner-a',
        record({ status: 'completed', claimId: 'owner-a', response: 'ok' }),
        5000,
      ),
    ).toBe(true);
    expect(query.mock.calls[0][0]).toContain('AND claim_id = $2');
    expect(query.mock.calls[0][0]).toContain("AND status = 'in_progress'");

    expect(await store.deleteIfOwned('k1', 'stale-owner')).toBe(false);
    expect(query.mock.calls[1][0]).toContain('AND claim_id = $2');
  });

  it('emits a CREATE/upgrade statement for the default table', () => {
    const sql = createIdempotencyTableSql();
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS idempotency_keys');
    expect(sql).toContain('key           TEXT        PRIMARY KEY');
    expect(sql).toContain('claim_id      TEXT');
    expect(sql).toContain(
      'ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS claim_id TEXT',
    );
  });

  it('rejects an unsafe table name', () => {
    expect(() => createIdempotencyTableSql('keys; DROP TABLE x')).toThrow();
    expect(
      () => new PostgresIdempotencyStore({ query: vi.fn() }, { table: '1bad' }),
    ).toThrow();
  });
});
