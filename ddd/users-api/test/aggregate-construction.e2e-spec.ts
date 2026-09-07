import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** E2E regression coverage for Architecture.md finding #5. */
describe('aggregate construction boundary (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  const admin = JSON.stringify({
    id: 'admin-aggregate-construction',
    email: 'admin@aggregate.test',
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

  it('creates through the application factory path and rehydrates the persisted aggregate', async () => {
    const email = `factory-${Date.now()}@acme.test`;

    const created = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({
        email,
        name: 'Factory Fiona',
        department: 'Engineering',
      });

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      email,
      name: 'Factory Fiona',
      department: 'Engineering',
    });

    const rehydrated = await request(http)
      .get(`/users/${created.body.id}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin);

    expect(rehydrated.status).toBe(200);
    expect(rehydrated.body).toMatchObject({
      id: created.body.id,
      email,
      name: 'Factory Fiona',
      department: 'Engineering',
    });
  });
});
