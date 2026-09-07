import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootstrapE2E,
  E2E_LOGIN_CODE,
  type E2EContext,
} from './support/e2e-app';

/** E2E regression coverage for Architecture.md finding #6. */
describe('login application/infrastructure boundary (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;
  const admin = JSON.stringify({
    id: 'admin-login-boundary',
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

  it('keeps the valid login HTTP contract through hashed-code and token adapters', async () => {
    const email = `boundary-${Date.now()}@acme.test`;
    const created = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Boundary Alice' });
    expect(created.status).toBe(201);

    const login = await request(http)
      .post('/auth/login')
      .set('x-tenant-schema', 'tenant')
      .send({ email, code: E2E_LOGIN_CODE });

    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ id: created.body.id, email });
    expect(typeof login.body.token).toBe('string');
  });

  it('maps neutral invalid-credential failures to HTTP 401', async () => {
    const login = await request(http)
      .post('/auth/login')
      .set('x-tenant-schema', 'tenant')
      .send({ email: 'missing@example.test', code: E2E_LOGIN_CODE });

    expect(login.status).toBe(401);
    expect(login.body).toMatchObject({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid credentials',
    });
  });

  it('does not reveal credential details for a wrong code', async () => {
    const login = await request(http)
      .post('/auth/login')
      .set('x-tenant-schema', 'tenant')
      .send({ email: 'someone@example.test', code: '000000' });

    expect(login.status).toBe(401);
    expect(login.body.message).toBe('Invalid credentials');
  });
});
