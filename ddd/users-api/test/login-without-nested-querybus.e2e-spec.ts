import type { Server } from 'node:http';
import { QueryBus } from '@nestjs/cqrs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  bootstrapE2E,
  E2E_LOGIN_CODE,
  type E2EContext,
} from './support/e2e-app';

/** Runtime regression for Architecture.md finding #4. */
describe('login command does not dispatch nested queries (e2e)', () => {
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

  it('resolves login capabilities without QueryBus.execute()', async () => {
    const email = `no-nested-querybus-${Date.now()}@acme.test`;
    const created = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Boundary User', department: 'engineering' });
    expect(created.status).toBe(201);

    const queryBus = ctx.app.get(QueryBus);
    const executeSpy = vi.spyOn(queryBus, 'execute');

    const login = await request(http)
      .post('/auth/login')
      .set('x-tenant-schema', 'tenant')
      .send({ email, code: E2E_LOGIN_CODE });

    expect(login.status).toBe(200);
    expect(login.body.id).toBe(created.body.id);
    expect(login.body).toHaveProperty('capabilities');
    expect(executeSpy).not.toHaveBeenCalled();

    executeSpy.mockRestore();
  });
});
