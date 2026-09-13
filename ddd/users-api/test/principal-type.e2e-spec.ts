/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** E2E regression coverage for Architecture.md finding #9 and explicit principal classification. */
describe('explicit principal type (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('accepts a UUID-looking service principal when it is explicitly classified', async () => {
    const service = JSON.stringify({
      id: '019488e0-0000-7000-8000-000000000999',
      principalType: 'service',
      capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
    });

    const res = await request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', service);

    expect(res.status).toBe(200);
  });

  it('rejects a non-persisted human-readable id explicitly classified as a user', async () => {
    const missingUser = JSON.stringify({
      id: 'human-readable-missing-user',
      principalType: 'user',
      capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
    });

    const res = await request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', missingUser);

    expect(res.status).toBe(403);
  });

  it('rejects an unclassified or unrecognized principal type', async () => {
    const unclassified = JSON.stringify({
      id: 'unclassified-principal-123',
      principalType: 'unknown',
      capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
    });

    const res = await request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', unclassified);

    expect(res.status).toBe(403);
  });
});
