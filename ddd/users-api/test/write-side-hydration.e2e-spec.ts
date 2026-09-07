import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIKRO_ORM_CLIENT, type MikroOrmStore } from '@persistence/mikro-orm.store';
import { User } from '../src/users/domain/models/user.entity';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** Regression coverage for Architecture.md finding #2. */
describe('write-side command hydration (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;
  const admin = JSON.stringify({ id: 'admin-write-side', email: 'admin@acme.test', department: 'platform', capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] } });
  const authed = (req: request.Test) => req.set('x-tenant-schema', 'tenant').set('x-test-user', admin);

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });
  afterAll(async () => { await ctx?.close(); });

  it('PATCH reads current persistence even when the GET cache contains an older snapshot', async () => {
    const email = `write-side-${Date.now()}@acme.test`;
    const created = await authed(request(http).post('/users')).send({ email, name: 'Cached Alice', department: 'engineering' });
    expect(created.status).toBe(201);

    const warmed = await authed(request(http).get(`/users/${created.body.id}`));
    expect(warmed.status).toBe(200);

    const store = ctx.app.get<MikroOrmStore>(MIKRO_ORM_CLIENT);
    await store.em.nativeUpdate(User, { id: created.body.id }, { department: 'platform', version: 2 });
    store.em.clear();

    const updated = await authed(request(http).patch(`/users/${created.body.id}`)).send({ name: 'Fresh Alice' });

    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: 'Fresh Alice', department: 'platform' });
  });
});
