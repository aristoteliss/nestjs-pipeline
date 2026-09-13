import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** E2E regression coverage for Architecture.md finding #22. */
describe('tenant-scoped create keys (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  const admin = JSON.stringify({
    id: 'same-admin',
    email: 'same-admin@acme.test',
    department: 'platform',
    capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
  });

  beforeAll(async () => {
    ctx = await bootstrapE2E({ tenants: ['tenant_a', 'tenant_b'] });
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('allows the same principal and email to create independently in two tenants', async () => {
    const email = `cross-tenant-${Date.now()}@acme.test`;
    const create = (tenant: string) =>
      request(http)
        .post('/users')
        .set('x-tenant-schema', tenant)
        .set('x-test-user', admin)
        .send({ email, name: 'Tenant Scoped User' });

    const tenantA = await create('tenant_a');
    const tenantB = await create('tenant_b');

    expect(tenantA.status).toBe(201);
    expect(tenantB.status).toBe(201);
    expect(tenantA.body.id).not.toBe(tenantB.body.id);
  });
});
