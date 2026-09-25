/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { Server } from 'node:http';
import { MissingTenantContextError } from '@cqrs-ddd/core/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GetUsersHandler } from '../src/users/cqrs/queries/get-users.handler';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

describe('missing tenant context at the HTTP boundary (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  const admin = JSON.stringify({
    id: 'missing-tenant-admin',
    email: 'missing-tenant-admin@acme.test',
    department: 'platform',
    grants: ['all|manage|*'],
  });

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('answers a generic 500, because a missing tenant is server misconfiguration', async () => {
    const handler = ctx.app.get(GetUsersHandler);
    const execute = vi
      .spyOn(handler, 'execute')
      .mockRejectedValueOnce(
        new MissingTenantContextError('cache key derivation'),
      );

    const response = await request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin);

    expect(execute).toHaveBeenCalledOnce();
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal server error',
    });
    execute.mockRestore();
  });
});
