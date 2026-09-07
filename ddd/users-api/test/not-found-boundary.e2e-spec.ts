import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** E2E regression coverage for Architecture.md finding #18. */
describe('framework-neutral not-found boundary (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  const admin = JSON.stringify({
    id: 'not-found-admin',
    email: 'not-found-admin@acme.test',
    department: 'platform',
    capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
  });

  const authed = (req: request.Test) =>
    req.set('x-tenant-schema', 'tenant').set('x-test-user', admin);

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('maps an unknown user update to the existing HTTP 404 contract', async () => {
    const response = await authed(request(http).patch(`/users/${randomUUID()}`))
      .send({ name: 'Missing User' });

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    });
  });

  it('maps an unknown role delete to the existing HTTP 404 contract', async () => {
    const response = await authed(request(http).delete(`/roles/${randomUUID()}`));

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      error: 'Not Found',
      message: 'Role not found',
    });
  });
});
