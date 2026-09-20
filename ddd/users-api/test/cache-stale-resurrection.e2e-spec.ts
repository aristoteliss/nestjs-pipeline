/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Server } from 'node:http';
import { EntityManager } from '@mikro-orm/core';
import { uuidv7 } from '@nestjs-pipeline/core';
import { type ICache } from '@nestjs-pipeline/ddd-core/application';
import {
  CACHE_TOKEN,
  filterCacheKey,
} from '@nestjs-pipeline/ddd-core/persistence';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  User,
  type UserSnapshot,
} from '../src/users/domain/models/user.entity';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** Resolves the primary user cache key exactly as the repositories derive it. */
const userIdKey = (id: string) =>
  filterCacheKey(User.aggregateName, { id }, 'tenant');

describe('Cache Revision Fencing & Anti-Resurrection (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;
  const admin = JSON.stringify({
    id: 'admin-resurrection',
    email: 'admin-resurrection@acme.test',
    department: 'platform',
    capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
  });

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  type FindOneEntityName = Parameters<
    typeof EntityManager.prototype.findOne
  >[0];
  type FindOneFilter = Parameters<typeof EntityManager.prototype.findOne>[1];

  it('scenario 1: concurrent delete vs in-flight reader prevents deleted entity resurrection in cache', async () => {
    const email = `del-race-${Date.now()}@acme.test`;
    const createRes = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'To Be Deleted' });

    expect(createRes.status).toBe(201);
    const userId = createRes.body.id;
    const cacheKey = userIdKey(userId);
    const cache = ctx.app.get<ICache<unknown>>(CACHE_TOKEN);

    // Evict so next read-through must query the database
    await cache.delete(cacheKey);

    // Intercept findOne so that while the query is in flight, a DELETE command executes
    const origFindOne = EntityManager.prototype.findOne;
    let hookTriggered = false;

    try {
      EntityManager.prototype.findOne = async function (
        this: EntityManager,
        entityName: FindOneEntityName,
        where: FindOneFilter,
        ...rest: unknown[]
      ) {
        const result = await origFindOne.call(
          this,
          entityName as never,
          where as never,
          ...(rest as [never]),
        );
        if (
          !hookTriggered &&
          entityName === User &&
          typeof where === 'object' &&
          where !== null &&
          (where as Record<string, unknown>).id === userId &&
          result !== null
        ) {
          hookTriggered = true;
          // Concurrently delete the user while reader has already loaded the stale entity
          const delRes = await request(http)
            .delete(`/users/${userId}`)
            .set('x-tenant-schema', 'tenant')
            .set('x-test-user', admin);
          expect(delRes.status).toBe(204);
        }
        return result;
      };

      // In-flight read executes
      const readRes = await request(http)
        .get(`/users/${userId}`)
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin);

      // The delete advanced the key revision, so the reader's fill was fenced;
      // it retried the authoritative read and saw null -> 404
      expect(readRes.status).toBe(404);
    } finally {
      EntityManager.prototype.findOne = origFindOne;
    }

    // Crucial check: the cache must NOT contain the resurrected User snapshot!
    expect(await cache.get(cacheKey)).toBeUndefined();

    // Subsequent GET requests continue to return 404
    const subsequentRead = await request(http)
      .get(`/users/${userId}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin);
    expect(subsequentRead.status).toBe(404);
  });

  it('scenario 2: concurrent update vs in-flight reader prevents stale v1 from regressing cache', async () => {
    const email = `upd-race-${Date.now()}@acme.test`;
    const createRes = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Version 1 User' });

    expect(createRes.status).toBe(201);
    const userId = createRes.body.id;
    const cacheKey = userIdKey(userId);
    const cache = ctx.app.get<ICache<unknown>>(CACHE_TOKEN);

    // Evict so next read-through must query the database
    await cache.delete(cacheKey);

    const origFindOne = EntityManager.prototype.findOne;
    let hookTriggered = false;

    try {
      EntityManager.prototype.findOne = async function (
        this: EntityManager,
        entityName: FindOneEntityName,
        where: FindOneFilter,
        ...rest: unknown[]
      ) {
        const result = await origFindOne.call(
          this,
          entityName as never,
          where as never,
          ...(rest as [never]),
        );
        if (
          !hookTriggered &&
          entityName === User &&
          typeof where === 'object' &&
          where !== null &&
          (where as Record<string, unknown>).id === userId &&
          result !== null
        ) {
          hookTriggered = true;
          // Concurrently update to version 2 while reader loaded version 1
          const updateRes = await request(http)
            .patch(`/users/${userId}`)
            .set('x-tenant-schema', 'tenant')
            .set('x-test-user', admin)
            .send({ name: 'Version 2 User' });
          expect(updateRes.status).toBe(200);
        }
        return result;
      };

      const readRes = await request(http)
        .get(`/users/${userId}`)
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin);

      expect(readRes.status).toBe(200);
      // Reader must have received version 2 (via CAS comparison or retry), never stale version 1!
      expect(readRes.body.name).toBe('Version 2 User');
    } finally {
      EntityManager.prototype.findOne = origFindOne;
    }

    // Cache must contain version 2, never version 1
    const cachedEntry = (await cache.get(cacheKey)) as UserSnapshot;
    expect(cachedEntry).toBeDefined();
    expect(cachedEntry.version).toBe(2);
    expect(cachedEntry.username).toBe('Version 2 User');
  });

  it('scenario 3: secondary keys are evicted after delete', async () => {
    const email = `barrier-sec-${Date.now()}@acme.test`;
    const createRes = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Secondary Key User' });

    expect(createRes.status).toBe(201);
    const userId = createRes.body.id;
    const emailKey = filterCacheKey(User.aggregateName, { email }, 'tenant');
    const cache = ctx.app.get<ICache<unknown>>(CACHE_TOKEN);

    // Perform deletion
    const delRes = await request(http)
      .delete(`/users/${userId}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin);
    expect(delRes.status).toBe(204);

    // The email secondary key must no longer resolve to the deleted aggregate
    expect(await cache.get(emailKey)).toBeUndefined();
  });

  it('scenario 4: concurrent create race returns fresh snapshot instead of caching null', async () => {
    const email = `create-race-${Date.now()}@acme.test`;
    const syntheticId = uuidv7();
    const cacheKey = userIdKey(syntheticId);
    const cache = ctx.app.get<ICache<unknown>>(CACHE_TOKEN);

    const origFindOne = EntityManager.prototype.findOne;
    let hookTriggered = false;

    try {
      EntityManager.prototype.findOne = async function (
        this: EntityManager,
        entityName: FindOneEntityName,
        where: FindOneFilter,
        ...rest: unknown[]
      ) {
        const result = await origFindOne.call(
          this,
          entityName as never,
          where as never,
          ...(rest as [never]),
        );
        if (
          !hookTriggered &&
          entityName === User &&
          typeof where === 'object' &&
          where !== null &&
          (where as Record<string, unknown>).id === syntheticId &&
          result === null
        ) {
          hookTriggered = true;
          // Concurrently seed the cache with the newly created entity snapshot
          await cache.set(cacheKey, {
            id: syntheticId,
            username: 'Concurrent Created User',
            email,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }
        return result;
      };

      const readRes = await request(http)
        .get(`/users/${syntheticId}`)
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin);

      // Even though DB returned null to the query, the post-DB cache check detected
      // the concurrent creation and returned 200 with the hydrated user!
      expect(readRes.status).toBe(200);
      expect(readRes.body.id).toBe(syntheticId);
      expect(readRes.body.name).toBe('Concurrent Created User');
    } finally {
      EntityManager.prototype.findOne = origFindOne;
    }

    // Cache was NOT overwritten with null!
    const cachedAfter = (await cache.get(cacheKey)) as UserSnapshot | undefined;
    expect(cachedAfter).toBeDefined();
    expect(cachedAfter?.username).toBe('Concurrent Created User');
  });

  it('scenario 5: invalidation during an in-flight read fences the stale fill', async () => {
    const userId = uuidv7();
    const cacheKey = userIdKey(userId);
    const cache = ctx.app.get<ICache<unknown>>(CACHE_TOKEN);

    // Key starts at an advanced revision, as a prior deletion would leave it
    await cache.delete(cacheKey);

    const origFindOne = EntityManager.prototype.findOne;
    let hookTriggered = false;

    try {
      EntityManager.prototype.findOne = async function (
        this: EntityManager,
        entityName: FindOneEntityName,
        where: FindOneFilter,
        ...rest: unknown[]
      ) {
        const result = await origFindOne.call(
          this,
          entityName as never,
          where as never,
          ...(rest as [never]),
        );
        if (
          !hookTriggered &&
          entityName === User &&
          typeof where === 'object' &&
          where !== null &&
          (where as Record<string, unknown>).id === userId
        ) {
          hookTriggered = true;
          // A concurrent mutation advances the revision the reader observed
          await cache.delete(cacheKey);
        }
        return result;
      };

      const readRes = await request(http)
        .get(`/users/${userId}`)
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin);

      // User does not exist in DB -> 404
      expect(readRes.status).toBe(404);
    } finally {
      EntityManager.prototype.findOne = origFindOne;
    }

    // The fenced read left no value behind on the key
    expect(await cache.get(cacheKey)).toBeUndefined();
  });
});
