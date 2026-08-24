/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bootstrapE2E,
  E2E_LOGIN_CODE,
  type E2EContext,
} from './support/e2e-app';

/**
 * End-to-end tests for the authentication use cases (`/auth/login`,
 * `/auth/logout`).
 *
 * These drive the real login command (code verification -> user lookup -> JWT
 * signing -> session population) over HTTP, asserting the externally observable
 * contract. The `AUTH_LOGIN_CODE` / `JWT_SECRET` the flow reads are provided by
 * the e2e harness, so no production configuration is involved.
 */
describe('auths-api (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  /** An admin principal used only to seed the user that then logs in. */
  const admin = JSON.stringify({
    id: 'admin-1',
    email: 'admin@acme.test',
    department: 'platform',
    capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
  });

  let emailSeq = 0;
  const newEmail = () => `auth-${Date.now()}-${emailSeq++}@acme.test`;

  /** Seeds a user with the admin principal so it can subsequently log in. */
  const seedUser = (email: string, name = 'Login Lena') =>
    request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name, department: 'engineering' });

  const login = (body: Record<string, unknown>) =>
    request(http)
      .post('/auth/login')
      .set('x-tenant-schema', 'tenant')
      .send(body);

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('POST /auth/login', () => {
    it('authenticates an existing user with the valid code (200)', async () => {
      const email = newEmail();
      const created = await seedUser(email, 'Ada Authenticated');
      expect(created.status).toBe(201);

      const res = await login({ email, code: E2E_LOGIN_CODE });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: created.body.id,
        email,
        department: 'engineering',
      });
      expect(res.body).toHaveProperty('capabilities');
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.length).toBeGreaterThan(0);
    });

    it('rejects an unknown email (401)', async () => {
      const res = await login({ email: newEmail(), code: E2E_LOGIN_CODE });

      expect(res.status).toBe(401);
    });

    it('rejects an invalid code (401)', async () => {
      const email = newEmail();
      await seedUser(email, 'Wrongcode Wally');

      // Well-formed (<=6 chars) but not the configured code, so it reaches the
      // authentication step and is rejected there rather than at the boundary.
      const res = await login({ email, code: '000000' });

      expect(res.status).toBe(401);
    });

    it('rejects a malformed payload at the Zod boundary (400)', async () => {
      const res = await login({ email: 'not-an-email', code: '' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('fieldErrors');
      expect(res.body.fieldErrors).toMatchObject({
        email: expect.any(Array),
        code: expect.any(Array),
      });
    });

    it('requires a tenant context (403)', async () => {
      const res = await request(http)
        .post('/auth/login')
        .send({ email: newEmail(), code: E2E_LOGIN_CODE });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /auth/logout', () => {
    it('clears the session and returns no content (204)', async () => {
      const res = await request(http)
        .post('/auth/logout')
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin);

      expect(res.status).toBe(204);
    });

    it('is a no-op for an anonymous caller (204)', async () => {
      const res = await request(http)
        .post('/auth/logout')
        .set('x-tenant-schema', 'tenant');

      expect(res.status).toBe(204);
    });

    it('requires a tenant context (403)', async () => {
      const res = await request(http).post('/auth/logout');

      expect(res.status).toBe(403);
    });
  });
});
