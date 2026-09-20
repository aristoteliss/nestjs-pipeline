/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

const admin = JSON.stringify({ id: 'denials-admin', grants: ['all|manage|*'] });

describe.each(['express', 'fastify'] as const)(
  'authorization denials over HTTP (%s)',
  (adapter) => {
    let ctx: E2EContext;
    let http: Server;
    let engineeringUserId: string;

    const as = (principal: string) => ({
      get: (path: string) =>
        request(http)
          .get(path)
          .set('x-tenant-schema', 'tenant')
          .set('x-test-user', principal),
    });

    beforeAll(async () => {
      ctx = await bootstrapE2E({ adapter });
      http = ctx.app.getHttpServer() as Server;

      const created = await request(http)
        .post('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin)
        .send({
          email: `denials-${adapter}-${Date.now()}@acme.test`,
          name: 'Denial Target',
          department: 'engineering',
        });
      expect(created.status).toBe(201);
      engineeringUserId = created.body.id;
    });

    afterAll(async () => {
      await ctx?.close();
    });

    it('answers a type-level denial with 403', async () => {
      const noGrants = JSON.stringify({ id: 'denials-nobody', grants: [] });

      const res = await as(noGrants).get(`/users/${engineeringUserId}`);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        error: 'Forbidden',
        action: 'read',
        subject: 'User',
      });
    });

    it('answers an entity-level denial with 403', async () => {
      const salesReader = JSON.stringify({
        id: 'denials-sales-reader',
        grants: ['User|read|{"department":"sales"}'],
      });

      const res = await as(salesReader).get(`/users/${engineeringUserId}`);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        error: 'Forbidden',
        action: 'read',
        subject: 'User',
      });
      expect(res.body.message).toContain(
        'insufficient permissions to read User',
      );
    });
  },
);
