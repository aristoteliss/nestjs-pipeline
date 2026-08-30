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

import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/**
 * Functional / end-to-end tests for the roles use cases (`/roles`).
 */
describe('roles-api (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  /** An admin principal injected by the test auth interceptor. */
  const admin = JSON.stringify({
    id: 'admin-1',
    email: 'admin@acme.test',
    department: 'platform',
    capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
  });

  /** A principal with no capabilities — authenticated but not authorized. */
  const guest = JSON.stringify({
    id: 'guest-1',
    email: 'guest@acme.test',
    department: 'platform',
    capabilities: { roles: [] },
  });

  const as = (user: string) => {
    const authed = (req: request.Test) =>
      req.set('x-tenant-schema', 'tenant').set('x-test-user', user);
    return {
      get: (url: string) => authed(request(http).get(url)),
      post: (url: string) => authed(request(http).post(url)),
      patch: (url: string) => authed(request(http).patch(url)),
      delete: (url: string) => authed(request(http).delete(url)),
    };
  };

  let roleSeq = 0;
  const newRoleName = () => `role-${Date.now()}-${roleSeq++}`;

  const createRole = (user: string, name: string) =>
    as(user).post('/roles').send({ name });

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('POST /roles', () => {
    it('creates a role and returns the mapped response (201)', async () => {
      const name = newRoleName();

      const res = await createRole(admin, name);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ name });
      expect(typeof res.body.id).toBe('string');
      expect(res.body.id.length).toBeGreaterThan(0);
    });

    it('replays a duplicate role create for the same principal', async () => {
      const name = newRoleName();
      const first = await createRole(admin, name);
      expect(first.status).toBe(201);

      const duplicate = await createRole(admin, name);
      expect(duplicate.status).toBe(201);
      expect(duplicate.body).toEqual(first.body);
    });

    it('rejects a name shorter than the minimum of 3 characters (400)', async () => {
      const res = await createRole(admin, 'ab');

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('fieldErrors');
      expect(res.body.fieldErrors).toHaveProperty('name');
    });

    it('denies role creation for a principal without capabilities (403)', async () => {
      const res = await createRole(guest, newRoleName());

      expect(res.status).toBe(403);
    });

    it('denies role creation for an anonymous request (403)', async () => {
      const res = await request(http)
        .post('/roles')
        .set('x-tenant-schema', 'tenant')
        .send({ name: newRoleName() });

      expect(res.status).toBe(403);
    });

    it('requires tenant context (403)', async () => {
      const res = await request(http)
        .post('/roles')
        .set('x-test-user', admin)
        .send({ name: newRoleName() });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /roles & GET /roles/:id', () => {
    it('lists all roles (200)', async () => {
      const name = newRoleName();
      await createRole(admin, name);

      const res = await as(admin).get('/roles');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.roles)).toBe(true);
      expect(
        res.body.roles.some((r: { name: string }) => r.name === name),
      ).toBe(true);
    });

    it('denies anonymous listing of roles (403)', async () => {
      const res = await request(http)
        .get('/roles')
        .set('x-tenant-schema', 'tenant');

      expect(res.status).toBe(403);
    });

    it('fetches a single role by id (200)', async () => {
      const name = newRoleName();
      const created = await createRole(admin, name);

      const res = await as(admin).get(`/roles/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: created.body.id, name });
    });

    it('returns 404 when querying an unknown role UUID', async () => {
      const unknownId = randomUUID();
      const res = await as(admin).get(`/roles/${unknownId}`);

      expect(res.status).toBe(404);
    });

    it('denies reading a single role for an anonymous request (403)', async () => {
      const created = await createRole(admin, newRoleName());

      const res = await request(http)
        .get(`/roles/${created.body.id}`)
        .set('x-tenant-schema', 'tenant');

      expect(res.status).toBe(403);
    });

    it('denies reading a single role for a principal without capabilities (403)', async () => {
      const created = await createRole(admin, newRoleName());

      const res = await as(guest).get(`/roles/${created.body.id}`);

      expect(res.status).toBe(403);
    });

    it('rejects a malformed role id on GET (400)', async () => {
      const res = await as(admin).get('/roles/not-a-uuid');

      expect(res.status).toBe(400);
    });

    it('requires tenant context for GET /roles (403)', async () => {
      const res = await request(http).get('/roles');

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /roles/:id', () => {
    it('updates a role name (200)', async () => {
      const created = await createRole(admin, newRoleName());
      const renamed = newRoleName();

      const res = await as(admin)
        .patch(`/roles/${created.body.id}`)
        .send({ name: renamed });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: created.body.id, name: renamed });
    });

    it('rejects renaming a role to an already existing name (400)', async () => {
      const existingName = newRoleName();
      await createRole(admin, existingName);

      const toRename = await createRole(admin, newRoleName());

      const res = await as(admin)
        .patch(`/roles/${toRename.body.id}`)
        .send({ name: existingName });

      expect(res.status).toBe(400);
    });

    it('returns 404 when updating an unknown role UUID', async () => {
      const unknownId = randomUUID();
      const res = await as(admin)
        .patch(`/roles/${unknownId}`)
        .send({ name: newRoleName() });

      expect(res.status).toBe(404);
    });

    it('rejects a role update with a too-short name (400)', async () => {
      const created = await createRole(admin, newRoleName());

      const res = await as(admin)
        .patch(`/roles/${created.body.id}`)
        .send({ name: 'ab' });

      expect(res.status).toBe(400);
    });

    it('rejects a malformed role id on PATCH (400)', async () => {
      const res = await as(admin)
        .patch('/roles/not-a-uuid')
        .send({ name: newRoleName() });

      expect(res.status).toBe(400);
    });

    it('denies role update for an unauthorized guest (403)', async () => {
      const created = await createRole(admin, newRoleName());

      const res = await as(guest)
        .patch(`/roles/${created.body.id}`)
        .send({ name: newRoleName() });

      expect(res.status).toBe(403);
    });

    it('requires tenant context for PATCH /roles/:id (403)', async () => {
      const created = await createRole(admin, newRoleName());

      const res = await request(http)
        .patch(`/roles/${created.body.id}`)
        .send({ name: newRoleName() });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /roles/:id', () => {
    it('deletes a role (204) and it no longer appears in the listing', async () => {
      const name = newRoleName();
      const created = await createRole(admin, name);

      const del = await as(admin).delete(`/roles/${created.body.id}`);
      expect(del.status).toBe(204);

      const list = await as(admin).get('/roles');
      expect(list.status).toBe(200);
      expect(
        list.body.roles.some((r: { id: string }) => r.id === created.body.id),
      ).toBe(false);
    });

    it('returns 404 when deleting an unknown role UUID', async () => {
      const unknownId = randomUUID();
      const res = await as(admin).delete(`/roles/${unknownId}`);

      expect(res.status).toBe(404);
    });

    it('rejects a malformed role id on DELETE (400)', async () => {
      const res = await as(admin).delete('/roles/not-a-uuid');

      expect(res.status).toBe(400);
    });

    it('denies role deletion for an unauthorized guest (403)', async () => {
      const created = await createRole(admin, newRoleName());

      const res = await as(guest).delete(`/roles/${created.body.id}`);

      expect(res.status).toBe(403);
    });

    it('requires tenant context for DELETE /roles/:id (403)', async () => {
      const created = await createRole(admin, newRoleName());

      const res = await request(http).delete(`/roles/${created.body.id}`);

      expect(res.status).toBe(403);
    });
  });
});
