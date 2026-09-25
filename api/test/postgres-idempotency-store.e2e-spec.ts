/* Copyright (C) 2026-present Aristotelis — see repository license. */
import {
  createIdempotencyTableSql,
  type IdempotencyRecord,
  PostgresIdempotencyStore,
} from '@nestjs-pipeline/idempotency';
import { Pool } from 'pg';
import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('PostgresIdempotencyStore against PostgreSQL', () => {
  let postgres: StartedTestContainer | undefined;
  let pool: Pool | undefined;
  let store: PostgresIdempotencyStore;

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:16-alpine')
      .withEnvironment({
        POSTGRES_DB: 'idempotency_test',
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();
    pool = new Pool({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      database: 'idempotency_test',
      user: 'test',
      password: 'test',
    });
    await pool.query(createIdempotencyTableSql());
    store = new PostgresIdempotencyStore(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await postgres?.stop();
  });

  const completed = (key: string): IdempotencyRecord => ({
    key,
    status: 'completed',
    requestName: 'CreateOrderCommand',
    response: { orderId: 'o-1' },
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  });

  async function expiresInMs(key: string): Promise<number> {
    const { rows } = await (pool as Pool).query(
      'SELECT expires_at FROM idempotency_keys WHERE key = $1',
      [key],
    );
    return (rows[0].expires_at as Date).getTime() - Date.now();
  }

  it('stores an unconditional write with an expiry of now plus the TTL', async () => {
    await store.set('set-key', completed('set-key'), 60_000);

    await expect(store.get('set-key')).resolves.toMatchObject({
      status: 'completed',
      response: { orderId: 'o-1' },
    });
    const remaining = await expiresInMs('set-key');
    expect(remaining).toBeGreaterThan(50_000);
    expect(remaining).toBeLessThanOrEqual(60_000);
  });

  it('replaces an existing record and its expiry on a later unconditional write', async () => {
    await store.set('reset-key', completed('reset-key'), 1_000);
    await store.set('reset-key', completed('reset-key'), 120_000);

    expect(await expiresInMs('reset-key')).toBeGreaterThan(110_000);
  });

  it('completes and replays a response with NUL characters and unpaired surrogates exactly', async () => {
    const response = {
      note: 'nul\u0000inside',
      lone: 'high \ud800 and low \udc00',
      pair: '\ud83d\ude00',
    };
    const claim: IdempotencyRecord = {
      key: 'text-key',
      status: 'in_progress',
      requestName: 'CreateOrderCommand',
      claimId: 'owner-1',
      createdAt: new Date().toISOString(),
    };

    await expect(store.setIfAbsent('text-key', claim, 60_000)).resolves.toBe(
      true,
    );
    await expect(
      store.completeIfOwned(
        'text-key',
        'owner-1',
        {
          ...claim,
          status: 'completed',
          response,
          completedAt: new Date().toISOString(),
        },
        60_000,
      ),
    ).resolves.toBe(true);

    const replayed = await store.get('text-key');
    expect(replayed?.response).toEqual(response);
  });
});
