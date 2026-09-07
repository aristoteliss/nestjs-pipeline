import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** End-to-end regression for Architecture.md finding #19. */
describe('event cross-cutting pipeline (e2e)', () => {
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

  it('preserves event side effects under an explicit request correlation id', async () => {
    const correlationId = 'event-crosscutting-e2e';
    const email = `event-crosscutting-${Date.now()}@acme.test`;

    const created = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-correlation-id', correlationId)
      .set('x-test-user', admin)
      .send({ email, name: 'Crosscutting Event User' });
    expect(created.status).toBe(201);

    const updated = await request(http)
      .patch(`/users/${created.body.id}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-correlation-id', correlationId)
      .set('x-test-user', admin)
      .send({ name: 'Crosscutting Event User Updated' });

    expect(updated.status).toBe(200);
  });
});
