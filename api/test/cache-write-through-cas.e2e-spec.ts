/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Server } from 'node:http';
import type { ICache } from '@cqrs-ddd/core/application';
import { CACHE_TOKEN, filterCacheKey } from '@cqrs-ddd/core/persistence';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  User,
  type UserSnapshot,
} from '../src/users/domain/models/user.entity';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

describe('cache write-through CAS & read strong consistency (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;
  const admin = JSON.stringify({
    id: 'admin-cas',
    email: 'admin@acme.test',
    department: 'platform',
    grants: ['all|manage|*'],
  });

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('prevents a late write-through from overwriting a newer cached snapshot', async () => {
    const email = `user-cas-${Date.now()}@acme.test`;

    // 1. Create a user through HTTP endpoint
    const createRes = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Initial User' });

    expect(createRes.status).toBe(201);
    const userId = createRes.body.id;
    const cacheKey = filterCacheKey(
      User.aggregateName,
      { id: userId },
      'tenant',
    );

    const cache = ctx.app.get<ICache<UserSnapshot>>(CACHE_TOKEN);
    const cachedInitial = await cache.get(cacheKey);
    expect(cachedInitial).toBeDefined();
    expect(cachedInitial?.version).toBe(1);

    // 2. Simulate a concurrent writer having already committed and cached version 5
    const syntheticNewer: UserSnapshot = {
      id: userId,
      username: 'Concurrent Newer User',
      email,
      department: 'platform',
      version: 5,
      createdAt: cachedInitial?.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await cache.set(cacheKey, syntheticNewer);

    // 3. Perform an update on the user (which will advance DB to version 2)
    const updateRes = await request(http)
      .patch(`/users/${userId}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ name: 'Updated User v2' });

    expect(updateRes.status).toBe(200);

    // 4. In cache: @Cache write-through for version 2 ran, but CAS (isCacheNewer)
    // prevented version 2 from overwriting version 5!
    const cachedAfter = await cache.get(cacheKey);
    expect(cachedAfter).toBeDefined();
    expect(cachedAfter?.version).toBe(5);
    expect(cachedAfter?.username).toBe('Concurrent Newer User');
  });

  it('returns hydrated entity from cache on read-through query hit', async () => {
    const email = `read-cas-${Date.now()}@acme.test`;

    const createRes = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Read Test User' });

    expect(createRes.status).toBe(201);
    const userId = createRes.body.id;

    // Read back through GET endpoint
    const readRes = await request(http)
      .get(`/users/${userId}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin);

    expect(readRes.status).toBe(200);
    expect(readRes.body.id).toBe(userId);
    expect(readRes.body.name).toBe('Read Test User');
  });
});
