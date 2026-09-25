/* Copyright (C) 2026-present Aristotelis — see repository license. */
import {
  type IdempotencyRecord,
  RedisIdempotencyStore,
} from '@nestjs-pipeline/idempotency';
import { createClient } from '@redis/client';
import {
  RedisContainer,
  type StartedRedisContainer,
} from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('RedisIdempotencyStore against Redis', () => {
  let redis: StartedRedisContainer | undefined;
  let client: ReturnType<typeof createClient>;
  let store: RedisIdempotencyStore;

  beforeAll(async () => {
    redis = await new RedisContainer('redis:7-alpine').start();
    client = createClient({ url: redis.getConnectionUrl() });
    await client.connect();
    store = new RedisIdempotencyStore(client);
  });

  afterAll(async () => {
    await client?.close();
    await redis?.stop();
  });

  const claim = (key: string, claimId: string): IdempotencyRecord => ({
    key,
    status: 'in_progress',
    requestName: 'CreateOrderCommand',
    claimId,
    fingerprint: 'fp-1',
    createdAt: new Date().toISOString(),
  });

  const completed = (
    key: string,
    claimId: string,
    response: unknown = { orderId: 'o-1', lines: ['a', 'b'], note: 'Ελένη ✓' },
  ): IdempotencyRecord => ({
    ...claim(key, claimId),
    status: 'completed',
    response: response as IdempotencyRecord['response'],
    completedAt: new Date().toISOString(),
  });

  it('claims an absent key once, with the TTL on the Redis key', async () => {
    await expect(
      store.setIfAbsent('claim:1', claim('claim:1', 'c-1'), 60_000),
    ).resolves.toBe(true);
    await expect(
      store.setIfAbsent('claim:1', claim('claim:1', 'c-2'), 60_000),
    ).resolves.toBe(false);

    await expect(store.get('claim:1')).resolves.toMatchObject({
      status: 'in_progress',
      claimId: 'c-1',
    });
    const ttl = await client.pTTL('idempotency:claim:1');
    expect(ttl).toBeGreaterThan(50_000);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });

  it('lets exactly one of many concurrent claims win', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.setIfAbsent('race:1', claim('race:1', `c-${i}`), 60_000),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('completes an owned claim with the new record and TTL', async () => {
    await store.setIfAbsent('complete:1', claim('complete:1', 'c-1'), 60_000);

    await expect(
      store.completeIfOwned(
        'complete:1',
        'c-1',
        completed('complete:1', 'c-1'),
        120_000,
      ),
    ).resolves.toBe(true);

    await expect(store.get('complete:1')).resolves.toMatchObject({
      status: 'completed',
      response: { orderId: 'o-1', lines: ['a', 'b'], note: 'Ελένη ✓' },
    });
    expect(await client.pTTL('idempotency:complete:1')).toBeGreaterThan(
      110_000,
    );
  });

  it('does not complete a claim it lost to a newer claim after expiry', async () => {
    await store.setIfAbsent('lost:1', claim('lost:1', 'old'), 50);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await expect(
      store.setIfAbsent('lost:1', claim('lost:1', 'new'), 60_000),
    ).resolves.toBe(true);

    await expect(
      store.completeIfOwned(
        'lost:1',
        'old',
        completed('lost:1', 'old'),
        60_000,
      ),
    ).resolves.toBe(false);
    await expect(store.deleteIfOwned('lost:1', 'old')).resolves.toBe(false);

    await expect(store.get('lost:1')).resolves.toMatchObject({
      status: 'in_progress',
      claimId: 'new',
    });
  });

  it('does not complete an already completed record or an absent key', async () => {
    await store.set('done:1', completed('done:1', 'c-1'), 60_000);

    await expect(
      store.completeIfOwned('done:1', 'c-1', completed('done:1', 'c-1'), 1),
    ).resolves.toBe(false);
    await expect(
      store.completeIfOwned(
        'absent:1',
        'c-1',
        completed('absent:1', 'c-1'),
        60_000,
      ),
    ).resolves.toBe(false);
    await expect(store.deleteIfOwned('absent:1', 'c-1')).resolves.toBe(false);
  });

  it('releases an owned claim so the key can be claimed again', async () => {
    await store.setIfAbsent('release:1', claim('release:1', 'c-1'), 60_000);

    await expect(store.deleteIfOwned('release:1', 'c-1')).resolves.toBe(true);

    await expect(store.get('release:1')).resolves.toBeUndefined();
    await expect(
      store.setIfAbsent('release:1', claim('release:1', 'c-2'), 60_000),
    ).resolves.toBe(true);
  });

  it('overwrites and deletes unconditionally with set and delete', async () => {
    await store.set('plain:1', completed('plain:1', 'c-1'), 60_000);
    await store.set('plain:1', completed('plain:1', 'c-2', null), 60_000);

    await expect(store.get('plain:1')).resolves.toMatchObject({
      claimId: 'c-2',
      response: null,
    });
    await store.delete('plain:1');
    await expect(store.get('plain:1')).resolves.toBeUndefined();
  });

  it('applies the key prefix', async () => {
    const prefixed = new RedisIdempotencyStore(client, { keyPrefix: 'app:' });
    await prefixed.set('k', completed('k', 'c-1'), 60_000);

    expect(await client.exists('app:k')).toBe(1);
    await expect(prefixed.get('k')).resolves.toMatchObject({ claimId: 'c-1' });
  });

  describe('a stored value that is not valid JSON', () => {
    it('makes get throw, so the request fails instead of running', async () => {
      await client.set('idempotency:corrupt:1', '{not json');

      await expect(store.get('corrupt:1')).rejects.toThrow(SyntaxError);
    });

    it('is never completed, released or claimed over by the owner-aware writes', async () => {
      await client.set('idempotency:corrupt:2', '{not json', { PX: 60_000 });

      await expect(
        store.completeIfOwned(
          'corrupt:2',
          'c-1',
          completed('corrupt:2', 'c-1'),
          60_000,
        ),
      ).resolves.toBe(false);
      await expect(store.deleteIfOwned('corrupt:2', 'c-1')).resolves.toBe(
        false,
      );
      await expect(
        store.setIfAbsent('corrupt:2', claim('corrupt:2', 'c-1'), 60_000),
      ).resolves.toBe(false);
      expect(await client.get('idempotency:corrupt:2')).toBe('{not json');
    });
  });
});
