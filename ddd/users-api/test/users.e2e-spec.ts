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
 * Functional / end-to-end tests for the users use cases (`/users`).
 *
 * Exercises the complete stack end-to-end:
 *
 *   HTTP request
 *     → Fastify session shim (feeds the test principal)
 *     → Nest controller
 *     → Zod request validation pipe
 *     → CQRS CommandBus / QueryBus
 *     → nestjs-pipeline middleware / behaviors:
 *         - LoggingBehavior (tracing + audit log)
 *         - CaslBehavior (RBAC + ABAC authorization)
 *         - FeatureFlagBehavior (kill-switch gating)
 *         - IdempotencyBehavior (duplicate detection per email)
 *         - RateLimitBehavior (5 req / 60s per email)
 *         - tenant-aware DDD repository read-through cache
 *         - ResilienceBehavior (retry / circuit-breaker / timeout on delete)
 *         - AuditBehavior (action logging on delete)
 *     → DDD Command / Query Handlers
 *     → MikroORM + libSQL persistence
 *     → EventBus → BullMQ event handler
 */
describe('users-api (e2e)', () => {
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

  let emailSeq = 0;
  const newEmail = () => `user-${Date.now()}-${emailSeq++}@acme.test`;

  const createUser = (
    user: string,
    body: { email: string; name: string; department?: string | null },
  ) => as(user).post('/users').send(body);

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('POST /users', () => {
    it('creates a user and returns the mapped response (201)', async () => {
      const email = newEmail();

      const res = await createUser(admin, { email, name: 'Ada Lovelace' });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ email, name: 'Ada Lovelace' });
      expect(typeof res.body.id).toBe('string');
      expect(res.body.id.length).toBeGreaterThan(0);
    });

    it('normalizes email to lowercase (201)', async () => {
      const rawEmail = `Upper.${Date.now()}-${emailSeq++}@Acme.Test`;
      const expectedEmail = rawEmail.toLowerCase();

      const res = await createUser(admin, {
        email: rawEmail,
        name: 'Case Sensitive Carl',
      });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe(expectedEmail);
    });

    it('creates a user without a department (201)', async () => {
      const email = newEmail();

      const res = await createUser(admin, { email, name: 'No Dept Dan' });

      expect(res.status).toBe(201);
      expect(res.body.department).toBeNull();
    });

    it('rejects an invalid payload at the Zod boundary (400)', async () => {
      const res = await createUser(admin, {
        email: 'not-an-email',
        name: 'no', // shorter than the 3-char minimum
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('fieldErrors');
      expect(res.body.fieldErrors).toMatchObject({
        email: expect.any(Array),
        name: expect.any(Array),
      });
    });

    it('denies an authenticated principal without capabilities (403)', async () => {
      const res = await createUser(guest, {
        email: newEmail(),
        name: 'Grace Hopper',
      });

      expect(res.status).toBe(403);
    });

    it('denies an anonymous request (403)', async () => {
      const res = await request(http)
        .post('/users')
        .set('x-tenant-schema', 'tenant')
        .send({ email: newEmail(), name: 'Anonymous User' });

      expect(res.status).toBe(403);
    });

    it('requires a tenant context (403)', async () => {
      const res = await request(http)
        .post('/users')
        .set('x-test-user', admin)
        .send({ email: newEmail(), name: 'Tenantless User' });

      expect(res.status).toBe(403);
    });

    it('echoes the chosen department back in the response (201)', async () => {
      const res = await createUser(admin, {
        email: newEmail(),
        name: 'Department Dana',
        department: 'engineering',
      });

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ department: 'engineering' });
    });
  });

  describe('idempotent user creation (IdempotencyBehavior)', () => {
    it('replays the original response when retrying with identical payload (201)', async () => {
      const email = newEmail();
      const body = {
        email,
        name: 'Idempotent Isaac',
        department: 'engineering',
      };

      const first = await createUser(admin, body);
      const replay = await createUser(admin, body);

      expect(first.status).toBe(201);
      expect(replay.status).toBe(201);
      expect(replay.body).toMatchObject({
        id: first.body.id,
        email: first.body.email,
        name: first.body.name,
      });
    });

    it('rejects retrying an email with a conflicting payload (422)', async () => {
      const email = newEmail();
      const first = await createUser(admin, {
        email,
        name: 'Original Name',
      });
      const conflict = await createUser(admin, {
        email, // same email = same idempotency key...
        name: 'Different Name', // ...but a different fingerprint
      });

      expect(first.status).toBe(201);
      expect(conflict.status).toBe(422);
      expect(conflict.body).toMatchObject({
        statusCode: 422,
        reason: 'key_reuse',
      });
    });

    it('treats distinct emails as distinct keys (independent creates)', async () => {
      const first = await createUser(admin, {
        email: newEmail(),
        name: 'Distinct Dora',
      });
      const second = await createUser(admin, {
        email: newEmail(),
        name: 'Distinct Dora',
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).not.toBe(first.body.id);
    });
  });

  describe('validation & not-found boundaries', () => {
    it('returns 404 for a well-formed but unknown id on GET', async () => {
      const res = await as(admin).get(`/users/${randomUUID()}`);

      expect(res.status).toBe(404);
    });

    it('returns 404 for a well-formed but unknown id on PATCH', async () => {
      const res = await as(admin)
        .patch(`/users/${randomUUID()}`)
        .send({ name: 'Unknown User Renamed' });

      expect(res.status).toBe(404);
    });

    it('returns 404 for a well-formed but unknown id on DELETE', async () => {
      const res = await as(admin).delete(`/users/${randomUUID()}`);

      expect(res.status).toBe(404);
    });

    it('rejects a malformed id on GET (400)', async () => {
      const res = await as(admin).get('/users/not-a-uuid');

      expect(res.status).toBe(400);
    });

    it('rejects a malformed id on PATCH (400)', async () => {
      const res = await as(admin)
        .patch('/users/not-a-uuid')
        .send({ name: 'Whatever Walt' });

      expect(res.status).toBe(400);
    });

    it('rejects a malformed id on DELETE (400)', async () => {
      const res = await as(admin).delete('/users/not-a-uuid');

      expect(res.status).toBe(400);
    });

    it('rejects an update payload that violates the schema (400)', async () => {
      const created = await createUser(admin, {
        email: newEmail(),
        name: 'Invalidate Ian',
      });

      const res = await as(admin)
        .patch(`/users/${created.body.id}`)
        .send({ name: 'no' }); // shorter than the 3-char minimum

      expect(res.status).toBe(400);
    });
  });

  describe('read / update / delete use cases', () => {
    it('lists users (200)', async () => {
      const email = newEmail();
      await createUser(admin, { email, name: 'Listable Liam' });

      const res = await as(admin).get('/users');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
      expect(
        res.body.users.some((u: { email: string }) => u.email === email),
      ).toBe(true);
    });

    it('fetches a single user by id (200)', async () => {
      const email = newEmail();
      const created = await createUser(admin, {
        email,
        name: 'Fetchable Finn',
      });

      const res = await as(admin).get(`/users/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: created.body.id, email });
    });

    it('denies reading a user for an anonymous request (403)', async () => {
      const created = await createUser(admin, {
        email: newEmail(),
        name: 'Private Pria',
      });

      const res = await request(http)
        .get(`/users/${created.body.id}`)
        .set('x-tenant-schema', 'tenant');

      expect(res.status).toBe(403);
    });

    it('denies an update for a principal without capabilities (403)', async () => {
      const created = await createUser(admin, {
        email: newEmail(),
        name: 'Guarded Gary',
      });

      const res = await as(guest)
        .patch(`/users/${created.body.id}`)
        .send({ name: 'Hijacked Hank' });

      expect(res.status).toBe(403);
    });

    it('updates a department (200)', async () => {
      const created = await createUser(admin, {
        email: newEmail(),
        name: 'Mover Mona',
        department: 'engineering',
      });

      const res = await as(admin)
        .patch(`/users/${created.body.id}`)
        .send({ department: 'platform' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: created.body.id,
        department: 'platform',
      });
    });

    it('clears a department by setting it to null (200)', async () => {
      const created = await createUser(admin, {
        email: newEmail(),
        name: 'Clear Dept Cora',
        department: 'engineering',
      });

      const res = await as(admin)
        .patch(`/users/${created.body.id}`)
        .send({ department: null });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: created.body.id,
        department: null,
      });
    });

    it('updates a user (200) and evicts the cache immediately', async () => {
      const created = await createUser(admin, {
        email: newEmail(),
        name: 'Updatable Uma',
      });

      // Populate single-user GET cache
      const cached = await as(admin).get(`/users/${created.body.id}`);
      expect(cached.body.name).toBe('Updatable Uma');

      // Update name
      const res = await as(admin)
        .patch(`/users/${created.body.id}`)
        .send({ name: 'Renamed Rachel' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Renamed Rachel');

      // Single-user GET immediately reflects the update due to cache eviction
      const updatedGet = await as(admin).get(`/users/${created.body.id}`);
      expect(updatedGet.body.name).toBe('Renamed Rachel');
    });

    it('updates the name and department together (200)', async () => {
      const created = await createUser(admin, {
        email: newEmail(),
        name: 'Combo Cora',
        department: 'engineering',
      });

      const res = await as(admin)
        .patch(`/users/${created.body.id}`)
        .send({ name: 'Combined Cleo', department: 'security' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: created.body.id,
        name: 'Combined Cleo',
        department: 'security',
      });
    });

    it('deletes a user (204) and evicts cache (subsequent GET returns 404)', async () => {
      const created = await createUser(admin, {
        email: newEmail(),
        name: 'Deletable Dave',
      });

      // Populate single-user GET cache
      const cached = await as(admin).get(`/users/${created.body.id}`);
      expect(cached.status).toBe(200);

      // Delete user
      const del = await as(admin).delete(`/users/${created.body.id}`);
      expect(del.status).toBe(204);

      // Single-user GET returns 404 immediately due to cache eviction
      const getAfterDelete = await as(admin).get(`/users/${created.body.id}`);
      expect(getAfterDelete.status).toBe(404);

      // Confirm deletion in uncached list
      const list = await as(admin).get('/users');
      expect(list.status).toBe(200);
      expect(
        list.body.users.some((u: { id: string }) => u.id === created.body.id),
      ).toBe(false);
    });
  });
});
