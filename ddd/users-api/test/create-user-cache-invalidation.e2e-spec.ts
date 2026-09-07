import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ICache } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import type { UserSnapshot } from '../src/users/domain/models/user.entity';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** Regression coverage for Architecture.md finding #7. */
describe('create-user secondary cache invalidation (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;
  const admin = JSON.stringify({ id: 'admin-cache', email: 'admin@acme.test', department: 'platform', capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] } });

  beforeAll(async () => { ctx = await bootstrapE2E(); http = ctx.app.getHttpServer() as Server; });
  afterAll(async () => { await ctx?.close(); });

  it('removes a stale email cache entry after creating that email', async () => {
    const email = `cache-create-${Date.now()}@acme.test`;
    const key = `tenant:user:email:${email}`;
    const cache = ctx.app.get<ICache<UserSnapshot>>(CACHE_TOKEN);
    await cache.set(key, { username: 'stale', email });
    expect(await cache.get(key)).toBeDefined();

    const response = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Fresh User' });

    expect(response.status).toBe(201);
    expect(await cache.get(key)).toBeUndefined();
  });
});
