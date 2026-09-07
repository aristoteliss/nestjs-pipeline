import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** End-to-end regression for Architecture.md finding #11. */
describe('delete resilience boundary (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  const admin = JSON.stringify({
    id: 'admin-1',
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

  it('preserves the successful HTTP delete contract after adapter error translation', async () => {
    const email = `delete-boundary-${Date.now()}@acme.test`;
    const created = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Delete Boundary User' });
    expect(created.status).toBe(201);

    const deleted = await request(http)
      .delete(`/users/${created.body.id}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin);

    expect(deleted.status).toBe(200);
    expect(deleted.body.id).toBe(created.body.id);

    const fetched = await request(http)
      .get(`/users/${created.body.id}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin);
    expect(fetched.status).toBe(404);
  });
});
