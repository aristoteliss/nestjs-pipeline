import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** E2E regression coverage for Architecture.md finding #9. */
describe('explicit principal discriminator (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('accepts a UUID-looking service principal with explicit service type', async () => {
    const service = JSON.stringify({
      id: '019488e0-0000-7000-8000-000000000999',
      principalType: 'service',
      email: 'uuid-service@acme.test',
      capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
    });

    const res = await request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', service);

    expect(res.status).toBe(200);
  });

  it('does not accept a non-UUID missing user merely because its id looks like a service id', async () => {
    const missingUser = JSON.stringify({
      id: 'human-readable-missing-user',
      principalType: 'user',
      email: 'missing-user@acme.test',
      capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
    });

    const res = await request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', missingUser);

    expect(res.status).toBe(403);
  });
});
