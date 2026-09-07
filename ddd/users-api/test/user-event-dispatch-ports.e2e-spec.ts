import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  USER_BATCH_DISPATCHER,
  WELCOME_EMAIL_DISPATCHER,
} from '../src/users/application/ports/user-event-dispatcher.port';
import { BullMqUserEventDispatcher } from '../src/users/jobs/bullmq-user-event-dispatcher.adapter';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** End-to-end regression for Architecture.md finding #12. */
describe('user event dispatch ports (e2e)', () => {
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

  it('binds both application dispatch ports to the BullMQ infrastructure adapter', () => {
    expect(ctx.app.get(WELCOME_EMAIL_DISPATCHER)).toBeInstanceOf(
      BullMqUserEventDispatcher,
    );
    expect(ctx.app.get(USER_BATCH_DISPATCHER)).toBeInstanceOf(
      BullMqUserEventDispatcher,
    );
  });

  it('preserves create/update HTTP flows while event handlers depend only on ports', async () => {
    const email = `event-port-${Date.now()}@acme.test`;
    const created = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Event Port User', department: 'engineering' });
    expect(created.status).toBe(201);

    const updated = await request(http)
      .patch(`/users/${created.body.id}`)
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ name: 'Event Port User Updated' });
    expect(updated.status).toBe(200);
  });
});
