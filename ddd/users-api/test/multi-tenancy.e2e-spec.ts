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
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/**
 * End-to-end tests for Multi-Tenancy & Tenant Schema Isolation.
 *
 * Exercises the `TenantSchemaMiddleware` header enforcement and verifies that
 * database records in distinct tenant schemas (`tenant_a`, `tenant_b`) are
 * completely isolated in their separate database instances.
 */
describe('multi-tenancy (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  const admin = JSON.stringify({
    id: 'admin-multi-tenant',
    email: 'admin@acme.test',
    department: 'platform',
    capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
  });

  let emailSeq = 0;
  const newEmail = () => `mt-${Date.now()}-${emailSeq++}@acme.test`;

  beforeAll(async () => {
    ctx = await bootstrapE2E({ tenants: ['tenant', 'tenant_a', 'tenant_b'] });
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('Tenant Header Enforcement (TenantSchemaMiddleware)', () => {
    it('rejects GET /users when x-tenant-schema is missing (403)', async () => {
      const res = await request(http)
        .get('/users')
        .set('x-test-user', admin);

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Tenant context is required to process this request.',
      });
    });

    it('rejects POST /users when x-tenant-schema is missing (403)', async () => {
      const res = await request(http)
        .post('/users')
        .set('x-test-user', admin)
        .send({ email: newEmail(), name: 'Missing Tenant' });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Tenant context is required to process this request.',
      });
    });

    it('rejects GET /roles when x-tenant-schema is missing (403)', async () => {
      const res = await request(http).get('/roles');

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Tenant context is required to process this request.',
      });
    });

    it('rejects POST /roles when x-tenant-schema is missing (403)', async () => {
      const res = await request(http)
        .post('/roles')
        .set('x-test-user', admin)
        .send({ name: 'AdminRole' });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Tenant context is required to process this request.',
      });
    });

    it('rejects POST /auth/login when x-tenant-schema is missing (403)', async () => {
      const res = await request(http)
        .post('/auth/login')
        .send({ email: 'user@acme.test', code: '424242' });

      expect(res.status).toBe(403);
      expect(res.body).toMatchObject({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Tenant context is required to process this request.',
      });
    });
  });

  describe('Tenant Data Isolation', () => {
    it('isolates users and caching between tenant_a and tenant_b', async () => {
      const email = newEmail();

      // 1. Create a user in tenant_a
      const createResA = await request(http)
        .post('/users')
        .set('x-tenant-schema', 'tenant_a')
        .set('x-test-user', admin)
        .send({ email, name: 'Tenant A User', department: 'engineering' });

      expect(createResA.status).toBe(201);
      const userAId = createResA.body.id;

      // 2. Fetch the user by ID in tenant_a (populates cache)
      const getResA = await request(http)
        .get(`/users/${userAId}`)
        .set('x-tenant-schema', 'tenant_a')
        .set('x-test-user', admin);

      expect(getResA.status).toBe(200);
      expect(getResA.body).toMatchObject({ id: userAId, email, name: 'Tenant A User' });

      // 3. Fetching the same user ID in tenant_b must return 404 (no cache bleed)
      const getResB = await request(http)
        .get(`/users/${userAId}`)
        .set('x-tenant-schema', 'tenant_b')
        .set('x-test-user', admin);

      expect(getResB.status).toBe(404);

      // 4. Listing in tenant_a contains userA
      const listResA = await request(http)
        .get('/users')
        .set('x-tenant-schema', 'tenant_a')
        .set('x-test-user', admin);

      expect(listResA.status).toBe(200);
      expect(
        listResA.body.users.some((u: { id: string }) => u.id === userAId),
      ).toBe(true);

      // 5. Listing in tenant_b should NOT contain userA
      const listResB = await request(http)
        .get('/users')
        .set('x-tenant-schema', 'tenant_b')
        .set('x-test-user', admin);

      expect(listResB.status).toBe(200);
      expect(
        listResB.body.users.some((u: { id: string }) => u.id === userAId),
      ).toBe(false);

      // 6. Creating a user with the EXACT SAME EMAIL in tenant_b succeeds
      // because each tenant has its own isolated database and tenant-prefixed idempotency key.
      const createResB = await request(http)
        .post('/users')
        .set('x-tenant-schema', 'tenant_b')
        .set('x-test-user', admin)
        .send({ email, name: 'Tenant B User', department: 'marketing' });

      expect(createResB.status).toBe(201);
      expect(createResB.body.id).not.toBe(userAId);
      expect(createResB.body.name).toBe('Tenant B User');

      // 7. Listing in tenant_a should NOT contain userB
      const listResAAfter = await request(http)
        .get('/users')
        .set('x-tenant-schema', 'tenant_a')
        .set('x-test-user', admin);

      expect(listResAAfter.status).toBe(200);
      expect(
        listResAAfter.body.users.some((u: { id: string }) => u.id === createResB.body.id),
      ).toBe(false);
    });

    it('isolates roles between tenant_a and tenant_b', async () => {
      const roleName = `role-tenant-iso-${Date.now()}`;

      // 1. Create a role in tenant_a
      const createRoleA = await request(http)
        .post('/roles')
        .set('x-tenant-schema', 'tenant_a')
        .set('x-test-user', admin)
        .send({ name: roleName });

      expect(createRoleA.status).toBe(201);
      const roleAId = createRoleA.body.id;

      // 2. Query roles in tenant_b - should not contain roleName
      const listRolesB = await request(http)
        .get('/roles')
        .set('x-tenant-schema', 'tenant_b')
        .set('x-test-user', admin);

      expect(listRolesB.status).toBe(200);
      expect(
        listRolesB.body.roles.some((r: { id: string }) => r.id === roleAId),
      ).toBe(false);

      // 3. Creating the same role name in tenant_b should succeed
      const createRoleB = await request(http)
        .post('/roles')
        .set('x-tenant-schema', 'tenant_b')
        .set('x-test-user', admin)
        .send({ name: roleName });

      expect(createRoleB.status).toBe(201);
      expect(createRoleB.body.id).not.toBe(roleAId);
    });
  });
});
