/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { describe, expect, it } from 'vitest';
import type { IQueryOptions } from '../../application/query.options';
import { ICache, IVersionedCache, isVersionedCache } from '../cache.interface';
import { Cache } from '../decorators/Cache';
import { FromCache } from '../decorators/FromCache';
import { filterCacheKey } from '../helpers/filter-cache-key.helper';
import { QueryRepository } from '../query-repository.abstract';
import { MemoryCache } from './memory.cache';

interface TestUserSnapshot {
  id: string;
  email: string;
  version: number;
}

interface TestUserQuery extends IQueryOptions {
  userId: string;
}

class TestUserQueryRepository extends QueryRepository<
  TestUserQuery,
  TestUserSnapshot | null
> {
  fetchCount = 0;
  mockDbResult: TestUserSnapshot | null = null;
  onBeforeDbFetch?: () => Promise<void> | void;

  @FromCache<TestUserQuery, TestUserSnapshot | null>({
    keyFn: (q) => filterCacheKey('user', { id: q.userId }, 'tenant_test'),
    alwaysHydrate: false,
  })
  async find(query: TestUserQuery): Promise<TestUserSnapshot | null> {
    void query;
    this.fetchCount++;
    if (this.onBeforeDbFetch) {
      await this.onBeforeDbFetch();
    }
    return this.mockDbResult;
  }
}

class TestUserCommandRepository {
  constructor(public cache: ICache<TestUserSnapshot>) {}

  @Cache<TestUserSnapshot, TestUserSnapshot>({
    invalidateKeys: (user) => [
      filterCacheKey('user', { id: user.id }, 'tenant_test'),
      filterCacheKey('user', { email: user.email }, 'tenant_test'),
    ],
  })
  async save(user: TestUserSnapshot): Promise<TestUserSnapshot | null> {
    return user;
  }

  @Cache<TestUserSnapshot, null>({
    deleteKeys: (user) => [
      filterCacheKey('user', { id: user.id }, 'tenant_test'),
      filterCacheKey('user', { email: user.email }, 'tenant_test'),
    ],
  })
  async delete(_user: TestUserSnapshot): Promise<null> {
    void _user;
    return null;
  }
}

describe('Versioned Cache Coordination Contract', () => {
  it('satisfies isVersionedCache capability guard for MemoryCache', () => {
    const cache = new MemoryCache<TestUserSnapshot>();
    expect(isVersionedCache(cache)).toBe(true);
  });

  it('invalidate after final read before fill rejects stale fill', async () => {
    const cache = new MemoryCache<TestUserSnapshot>();
    const key = filterCacheKey('user', { id: 'u-1' }, 'tenant_test');

    // Reader observes missing state
    const state = await cache.readState(key);
    expect(state.status).toBe('miss');
    expect(state.revision).toBe('0');

    // Concurrent writer invalidates key before reader can fill
    const newRev = await cache.invalidate(key);
    expect(newRev).toBe('1');

    // Reader attempts tryFill with stale observed revision
    const committed = await cache.tryFill(key, state.revision, {
      id: 'u-1',
      email: 'stale@test.local',
      version: 1,
    });

    expect(committed).toBe(false);
    expect(await cache.get(key)).toBeUndefined();

    const currentState = await cache.readState(key);
    expect(currentState.status).toBe('miss');
    expect(currentState.revision).toBe('1');
  });

  it('two competing fills commit first and reject second', async () => {
    const cache = new MemoryCache<TestUserSnapshot>();
    const key = filterCacheKey('user', { id: 'u-2' }, 'tenant_test');

    // Both readers observe missing state concurrently
    const state1 = await cache.readState(key);
    const state2 = await cache.readState(key);
    expect(state1.revision).toBe('0');
    expect(state2.revision).toBe('0');

    const snap1: TestUserSnapshot = {
      id: 'u-2',
      email: 'first@test.local',
      version: 1,
    };
    const snap2: TestUserSnapshot = {
      id: 'u-2',
      email: 'second@test.local',
      version: 1,
    };

    // First reader commits
    const committed1 = await cache.tryFill(key, state1.revision, snap1);
    expect(committed1).toBe(true);

    // Second reader tries to fill with same observed revision
    const committed2 = await cache.tryFill(key, state2.revision, snap2);
    expect(committed2).toBe(false);

    // Cache retains first reader snapshot
    expect(await cache.get(key)).toEqual(snap1);
  });

  it('rejects fills observed before an update and before a delete', async () => {
    const cache = new MemoryCache<TestUserSnapshot>();
    const commands = new TestUserCommandRepository(cache);
    const key = filterCacheKey('user', { id: 'u-3' }, 'tenant_test');

    // Initial creation
    await commands.save({ id: 'u-3', email: 'v1@test.local', version: 1 });
    const revAfterCreate = (await cache.readState(key)).revision;

    // Slower reader A observes state at v1
    const readerAState = await cache.readState(key);

    // Update to v2 invalidates key
    await commands.save({ id: 'u-3', email: 'v1@test.local', version: 2 });
    const revAfterUpdate = (await cache.readState(key)).revision;
    expect(BigInt(revAfterUpdate)).toBeGreaterThan(BigInt(revAfterCreate));

    // Reader A tries to fill v1 snapshot -> rejected
    const committedA = await cache.tryFill(key, readerAState.revision, {
      id: 'u-3',
      email: 'v1@test.local',
      version: 1,
    });
    expect(committedA).toBe(false);

    // Reader B observes state after update
    const readerBState = await cache.readState(key);

    // Delete aggregate invalidates key
    await commands.delete({ id: 'u-3', email: 'v1@test.local', version: 2 });
    const revAfterDelete = (await cache.readState(key)).revision;
    expect(BigInt(revAfterDelete)).toBeGreaterThan(BigInt(revAfterUpdate));

    // Reader B tries to fill v2 snapshot -> rejected
    const committedB = await cache.tryFill(key, readerBState.revision, {
      id: 'u-3',
      email: 'v1@test.local',
      version: 2,
    });
    expect(committedB).toBe(false);
  });

  it('secondary key changes are fenced by revision on update', async () => {
    const cache = new MemoryCache<TestUserSnapshot>();
    const commands = new TestUserCommandRepository(cache);
    const oldEmailKey = filterCacheKey(
      'user',
      { email: 'old@test.local' },
      'tenant_test',
    );

    // Reader observes old email key
    const oldState = await cache.readState(oldEmailKey);

    // Aggregate updated: invalidates primary and old email key
    await commands.save({ id: 'u-4', email: 'old@test.local', version: 2 });

    // Reader attempting to fill old email key is rejected
    const committed = await cache.tryFill(oldEmailKey, oldState.revision, {
      id: 'u-4',
      email: 'old@test.local',
      version: 1,
    });
    expect(committed).toBe(false);
  });

  it('expired value preserves revision to prevent ABA races', async () => {
    const cache = new MemoryCache<TestUserSnapshot>();
    const key = filterCacheKey('user', { id: 'u-5' }, 'tenant_test');

    // Fill with 1ms TTL
    await cache.tryFill(
      key,
      '0',
      { id: 'u-5', email: 'aba@test.local', version: 1 },
      { ttl: 1 },
    );
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Reader reads state after expiration
    const expiredState = await cache.readState(key);
    expect(expiredState.status).toBe('expired');
    expect(expiredState.revision).not.toBe('0');

    // Invalidation occurs before reader completes DB read
    await cache.invalidate(key);

    // Fill with expired observed revision must be rejected
    const committed = await cache.tryFill(key, expiredState.revision, {
      id: 'u-5',
      email: 'aba@test.local',
      version: 1,
    });
    expect(committed).toBe(false);
  });

  it('bounded retry exhaustion falls back to authoritative DB read', async () => {
    const cache = new MemoryCache<TestUserSnapshot>();
    const queryRepo = new TestUserQueryRepository(cache);
    const key = filterCacheKey('user', { id: 'u-6' }, 'tenant_test');

    queryRepo.mockDbResult = {
      id: 'u-6',
      email: 'authoritative@test.local',
      version: 3,
    };

    // Simulate persistent concurrent invalidation during each DB read
    queryRepo.onBeforeDbFetch = async () => {
      await cache.invalidate(key);
    };

    const result = await queryRepo.find({ userId: 'u-6' });

    // Returns authoritative result after retry exhaustion without corrupting cache
    expect(result).toEqual(queryRepo.mockDbResult);
    expect(queryRepo.fetchCount).toBeGreaterThan(1);
    expect(queryRepo.fetchCount).toBeLessThanOrEqual(3);
  });

  it('database success survives cache outage without throwing', async () => {
    const brokenCache: IVersionedCache<TestUserSnapshot> = {
      isVersioned: true,
      async get() {
        throw new Error('Cache connection refused');
      },
      async set() {
        throw new Error('Cache connection refused');
      },
      async delete() {
        throw new Error('Cache connection refused');
      },
      async readState() {
        throw new Error('Cache connection refused');
      },
      async invalidate() {
        throw new Error('Cache connection refused');
      },
      async tryFill() {
        throw new Error('Cache connection refused');
      },
    };

    const commands = new TestUserCommandRepository(brokenCache);
    const user: TestUserSnapshot = {
      id: 'u-7',
      email: 'outage@test.local',
      version: 1,
    };

    // Command save succeeds despite cache outage
    const saved = await commands.save(user);
    expect(saved).toEqual(user);

    // Command delete succeeds despite cache outage
    const deleted = await commands.delete(user);
    expect(deleted).toBeNull();
  });

  it('tenant isolation guarantees independent keys and revisions', async () => {
    const cache = new MemoryCache<TestUserSnapshot>();
    const keyTenantA = filterCacheKey('user', { id: 'u-8' }, 'tenant_a');
    const keyTenantB = filterCacheKey('user', { id: 'u-8' }, 'tenant_b');

    expect(keyTenantA).not.toBe(keyTenantB);

    await cache.tryFill(keyTenantA, '0', {
      id: 'u-8',
      email: 'a@test.local',
      version: 1,
    });

    expect((await cache.readState(keyTenantA)).status).toBe('hit');
    expect((await cache.readState(keyTenantB)).status).toBe('miss');

    await cache.invalidate(keyTenantA);
    expect((await cache.readState(keyTenantA)).revision).not.toBe('0');
    expect((await cache.readState(keyTenantB)).revision).toBe('0');
  });
});
