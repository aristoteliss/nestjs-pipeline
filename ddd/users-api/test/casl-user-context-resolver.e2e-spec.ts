import type { Server } from 'node:http';
import request from 'supertest';
import { CASL_USER_CONTEXT_RESOLVER } from '@nestjs-pipeline/casl';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CaslUserContextResolver } from '../src/users/services/casl-user-context.resolver';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** E2E regression coverage for Architecture.md finding #8. */
describe('CASL user-context resolver composition (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  const admin = JSON.stringify({
    id: 'service-admin-e2e',
    email: 'service-admin@acme.test',
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

  it('wires CASL to the dedicated singleton resolver and preserves authorization', async () => {
    const resolver = ctx.app.get(CASL_USER_CONTEXT_RESOLVER);
    expect(resolver).toBeInstanceOf(CaslUserContextResolver);

    const created = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({
        name: 'Resolver E2E User',
        email: `resolver-${Date.now()}@acme.test`,
      });

    expect(created.status).toBe(201);

    const fetched = await request(http)
      .get(`/users/${created.body.id}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin);

    expect(fetched.status).toBe(200);
    expect(fetched.body.id).toBe(created.body.id);
  });
});
