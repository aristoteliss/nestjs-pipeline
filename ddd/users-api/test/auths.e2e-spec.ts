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

    it('deletes persistent auth records on logout for authenticated user (204)', async () => {
      const email = newEmail();
      const created = await seedUser(email, 'Logout Lisa');
      expect(created.status).toBe(201);

      const loginRes = await login({ email, code: E2E_LOGIN_CODE });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.token;

      // Logout with the bearer token
      const logoutRes = await request(http)
        .post('/auth/logout')
        .set('x-tenant-schema', 'tenant')
        .set('authorization', `Bearer ${token}`);
      expect(logoutRes.status).toBe(204);

      // Verify token record in database was deleted
      const { Auth } = await import(
        '../../src/auths/domain/models/auth.entity'
      );
      const { MIKRO_ORM_CLIENT } = await import(
        '../../src/persistence/mikro-orm.store'
      );
      const store = ctx.app.get(MIKRO_ORM_CLIENT);
      const authRecord = await store.em.findOne(Auth, {
        userId: created.body.id,
      });
      expect(authRecord).toBeNull();
    });

    it('deletes persistent auth record on cookie session logout without authorization header (204)', async () => {
      const email = newEmail();
      const created = await seedUser(email, 'Cookie Logout User');
      expect(created.status).toBe(201);

      const loginRes = await login({ email, code: E2E_LOGIN_CODE });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.token;

      // Logout with simulated cookie session (user + token on session, no Authorization header)
      const logoutRes = await request(http)
        .post('/auth/logout')
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', JSON.stringify({ id: created.body.id, email }))
        .set('x-test-token', token);
      expect(logoutRes.status).toBe(204);

      // Verify token record in database was deleted
      const { Auth } = await import(
        '../../src/auths/domain/models/auth.entity'
      );
      const { MIKRO_ORM_CLIENT } = await import(
        '../../src/persistence/mikro-orm.store'
      );
      const store = ctx.app.get(MIKRO_ORM_CLIENT);
      const authRecord = await store.em.findOne(Auth, {
        userId: created.body.id,
      });
      expect(authRecord).toBeNull();
    });

    it('rejects a logged-out bearer token on protected endpoints (401)', async () => {
      const email = newEmail();
      const created = await seedUser(email, 'Logout Protected');
      expect(created.status).toBe(201);

      const { MIKRO_ORM_CLIENT } = await import(
        '../../src/persistence/mikro-orm.store'
      );
      const { UserRole } = await import(
        '../../src/persistence/entities/user-role.entity'
      );
      await ctx.app.get(MIKRO_ORM_CLIENT).em.upsert(UserRole, {
        userId: created.body.id,
        roleId: '019de10c-b680-7000-8000-000000000001',
      });

      const loginRes = await login({ email, code: E2E_LOGIN_CODE });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.token;

      // Token works before logout
      const before = await request(http)
        .get(`/users/${created.body.id}`)
        .set('x-tenant-schema', 'tenant')
        .set('authorization', `Bearer ${token}`);
      expect(before.status).toBe(200);

      // Logout with the bearer token
      const logoutRes = await request(http)
        .post('/auth/logout')
        .set('x-tenant-schema', 'tenant')
        .set('authorization', `Bearer ${token}`);
      expect(logoutRes.status).toBe(204);

      // Token is rejected after logout
      const after = await request(http)
        .get(`/users/${created.body.id}`)
        .set('x-tenant-schema', 'tenant')
        .set('authorization', `Bearer ${token}`);
      expect(after.status).toBe(401);
    });

    it('revokes only the specific session bearer token on logout leaving other sessions active', async () => {
      const email = newEmail();
      const created = await seedUser(email, 'Multi Session User');
      expect(created.status).toBe(201);

      const { MIKRO_ORM_CLIENT } = await import(
        '../../src/persistence/mikro-orm.store'
      );
      const { UserRole } = await import(
        '../../src/persistence/entities/user-role.entity'
      );
      const { Auth } = await import(
        '../../src/auths/domain/models/auth.entity'
      );
      await ctx.app.get(MIKRO_ORM_CLIENT).em.upsert(UserRole, {
        userId: created.body.id,
        roleId: '019de10c-b680-7000-8000-000000000001',
      });

      // Session 1 login
      const login1 = await login({ email, code: E2E_LOGIN_CODE });
      expect(login1.status).toBe(200);
      const token1 = login1.body.token;

      // Ensure distinct token issuance
      await new Promise((r) => setTimeout(r, 20));

      // Session 2 login
      const login2 = await login({ email, code: E2E_LOGIN_CODE });
      expect(login2.status).toBe(200);
      const token2 = login2.body.token;

      expect(token1).not.toBe(token2);

      // Logout session 1 with bearer token1
      const logoutRes = await request(http)
        .post('/auth/logout')
        .set('x-tenant-schema', 'tenant')
        .set('authorization', `Bearer ${token1}`);
      expect(logoutRes.status).toBe(204);

      // Session 1 token is now rejected
      const after1 = await request(http)
        .get(`/users/${created.body.id}`)
        .set('x-tenant-schema', 'tenant')
        .set('authorization', `Bearer ${token1}`);
      expect(after1.status).toBe(401);

      // Session 2 token remains active and valid
      const after2 = await request(http)
        .get(`/users/${created.body.id}`)
        .set('x-tenant-schema', 'tenant')
        .set('authorization', `Bearer ${token2}`);
      expect(after2.status).toBe(200);

      // Verify in persistence that token1 record was removed but token2 persists
      const store = ctx.app.get(MIKRO_ORM_CLIENT);
      const auth1 = await store.em.findOne(Auth, { token: token1 });
      const auth2 = await store.em.findOne(Auth, { token: token2 });
      expect(auth1).toBeNull();
      expect(auth2).not.toBeNull();
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
