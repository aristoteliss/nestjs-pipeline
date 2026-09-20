/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { Server } from 'node:http';
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

/** Regression coverage for Architecture.md finding #7. */
describe('create-user secondary cache invalidation (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;
  const admin = JSON.stringify({
    id: 'admin-cache',
    email: 'admin@acme.test',
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

  it('removes a stale email cache entry after creating that email', async () => {
    const email = `cache-create-${Date.now()}@acme.test`;
    const key = filterCacheKey(User.aggregateName, { email }, 'tenant');
    const cache = ctx.app.get<ICache<UserSnapshot>>(CACHE_TOKEN);
    await cache.set(key, { username: 'stale', email });
    expect(await cache.get(key)).toBeDefined();

    const response = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Fresh User' });

    expect(response.status).toBe(201);
    // The write-through invalidation evicts the secondary key outright: the
    // versioned adapter fences concurrent fills by revision, so no sentinel is
    // left behind for a later read to hydrate.
    expect(await cache.get(key)).toBeUndefined();
  });
});
