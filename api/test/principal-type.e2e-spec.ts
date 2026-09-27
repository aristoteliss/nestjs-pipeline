/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
      grants: ['all|manage|*'],
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
      grants: ['all|manage|*'],
    });

    const res = await request(http)
      .get('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', unclassified);

    expect(res.status).toBe(403);
  });

  describe('API key authentication (ApiClientAuthenticator)', () => {
    it('authenticates a service principal using x-api-id and x-api-key headers (200)', async () => {
      const res = await request(http)
        .get('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-api-id', 'api-read-only-client')
        .set('x-api-key', 'readonly-secret-key-12345');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
    });

    it('rejects an API client with an invalid secret key (401)', async () => {
      const res = await request(http)
        .get('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-api-id', 'api-read-only-client')
        .set('x-api-key', 'invalid-key');

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid API credentials',
      });
    });

    it('rejects an unknown API client id (401)', async () => {
      const res = await request(http)
        .get('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-api-id', 'unknown-client')
        .set('x-api-key', 'some-key');

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid API credentials',
      });
    });

    it('rejects an API client not authorized for the requested tenant (401)', async () => {
      const res = await request(http)
        .get('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-api-id', 'api-tenant-b-only-client')
        .set('x-api-key', 'tenant-b-secret-key-12345');

      expect(res.status).toBe(401);
      expect(res.body).toMatchObject({
        statusCode: 401,
        message: 'Invalid API credentials',
      });
    });
  });
});
