import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { COMMAND_REPOSITORY } from '../src/users/persistence/repository.tokens';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

describe('delete transient retry policy (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  const admin = JSON.stringify({
    id: 'admin-retry-e2e',
    email: 'admin-retry@acme.test',
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
    vi.restoreAllMocks();
    await ctx?.close();
  });

  it('retries a transient technical repository failure and completes the delete', async () => {
    const email = `retry-${Date.now()}@acme.test`;
    const created = await authed(request(http).post('/users')).send({
      email,
      name: 'Retry Target',
    });
    expect(created.status).toBe(201);

    const repository = ctx.app.get<{ save(entity: unknown): Promise<null> }>(
      COMMAND_REPOSITORY.deleteUser,
    );
    const originalSave = repository.save.bind(repository);
    const transient = Object.assign(new Error('database is busy'), {
      code: 'SQLITE_BUSY',
    });
    const saveSpy = vi
      .spyOn(repository, 'save')
      .mockRejectedValueOnce(transient)
      .mockImplementation(originalSave);

    const deleted = await authed(
      request(http).delete(`/users/${created.body.id}`),
    );

    expect(deleted.status).toBe(204);
    expect(saveSpy).toHaveBeenCalledTimes(2);
  });
});
