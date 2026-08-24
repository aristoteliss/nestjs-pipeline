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
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MIKRO_ORM_CLIENT,
  type MikroOrmStore,
} from '../src/persistence/mikro-orm.store';
import { BATCH_UPDATE_USERS_QUEUE } from '../src/users/jobs/batch-update-users.processor';
import { WELCOME_EMAIL_QUEUE } from '../src/users/jobs/send-welcome-email.processor';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/**
 * Exhaustive end-to-end test suite for all @nestjs-pipeline/* packages:
 * - @nestjs-pipeline/casl (RBAC, ABAC, dual rules, field-level, inverted rules, DB capabilities)
 * - @nestjs-pipeline/correlation (Header reflection, AsyncLocalStorage propagation into CQRS events & BullMQ jobs)
 * - @nestjs-pipeline/idempotency (Replay, key reuse conflict, independent keys)
 * - @nestjs-pipeline/rate-limit (Throttling, 429 status, retry-after headers)
 * - @nestjs-pipeline/cache (Query caching in Redis)
 * - @nestjs-pipeline/audit & resilience (Audit logging & resilience policy on delete)
 * - @nestjs-pipeline/deadletter & BullMQ (Event handling & job enqueuing)
 * - @nestjs-pipeline/zod (Boundary & DTO schema validation)
 */
describe('pipeline-packages (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;

  const admin = JSON.stringify({
    id: 'admin-pipeline-pkg',
    email: 'admin@acme.test',
    department: 'platform',
    capabilities: { roles: [], additionalCapabilities: ['all|manage|*'] },
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
  const newEmail = () => `pipe-${Date.now()}-${emailSeq++}@acme.test`;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await ctx?.close();
  });

  describe('@nestjs-pipeline/correlation', () => {
    it('echoes the incoming x-correlation-id in response headers', async () => {
      const customCorrId = `corr-${randomUUID()}`;

      const res = await request(http)
        .get('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin)
        .set('x-correlation-id', customCorrId);

      expect(res.status).toBe(200);
      expect(res.headers['x-correlation-id']).toBe(customCorrId);
    });

    it('generates a new correlation ID header when not provided', async () => {
      const res = await request(http)
        .get('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin);

      expect(res.status).toBe(200);
      expect(typeof res.headers['x-correlation-id']).toBe('string');
      expect(res.headers['x-correlation-id'].length).toBeGreaterThan(0);
    });

    it('propagates x-correlation-id from HTTP request into CQRS event and BullMQ job', async () => {
      const welcomeEmailQueue = ctx.app.get<Queue>(
        getQueueToken(WELCOME_EMAIL_QUEUE),
      );
      const email = newEmail();
      const customCorrId = `corr-${randomUUID()}`;

      const res = await request(http)
        .post('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin)
        .set('x-correlation-id', customCorrId)
        .send({ email, name: 'Correlation Prop User', department: 'platform' });

      expect(res.status).toBe(201);
      expect(res.headers['x-correlation-id']).toBe(customCorrId);

      // Verify the correlation ID reached the BullMQ job via HttpCorrelationMiddleware + correlationStore
      const jobs = await welcomeEmailQueue.getJobs([
        'waiting',
        'active',
        'completed',
        'delayed',
      ]);
      const job = jobs.find((j) => j.data?.email === email);

      expect(job).toBeDefined();
      expect(job?.data.correlationId).toBe(customCorrId);
    });
  });

  describe('@nestjs-pipeline/casl (Fine-Grained Authorization)', () => {
    it('enforces RBAC: allows User|read|* to read but denies create/update/delete', async () => {
      const userReadOnly = JSON.stringify({
        id: 'user-reader-1',
        email: 'reader@acme.test',
        department: 'engineering',
        capabilities: { roles: [], additionalCapabilities: ['User|read|*'] },
      });

      // 1. Can list users
      const listRes = await as(userReadOnly).get('/users');
      expect(listRes.status).toBe(200);

      // 2. Cannot create a user (403)
      const createRes = await as(userReadOnly)
        .post('/users')
        .send({ email: newEmail(), name: 'Forbidden User' });
      expect(createRes.status).toBe(403);
    });

    it('enforces dual-rule requirement on CreateRoleHandler (Role|create AND User|read)', async () => {
      // Caller with ONLY Role|create|* (missing User|read|*)
      const roleCreateOnly = JSON.stringify({
        id: 'role-creator-partial',
        email: 'roleonly@acme.test',
        capabilities: { roles: [], additionalCapabilities: ['Role|create|*'] },
      });

      const roleName1 = `dual-rule-role-${Date.now()}-1`;
      const deniedRes = await as(roleCreateOnly)
        .post('/roles')
        .send({ name: roleName1 });
      expect(deniedRes.status).toBe(403);

      // Caller with BOTH Role|create|* AND User|read|*
      const roleCreateWithUserRead = JSON.stringify({
        id: 'role-creator-full',
        email: 'rolefull@acme.test',
        capabilities: {
          roles: [],
          additionalCapabilities: ['Role|create|*', 'User|read|*'],
        },
      });

      const roleName2 = `dual-rule-role-${Date.now()}-2`;
      const allowedRes = await as(roleCreateWithUserRead)
        .post('/roles')
        .send({ name: roleName2 });
      expect(allowedRes.status).toBe(201);
      expect(allowedRes.body.name).toBe(roleName2);
    });

    it('enforces ABAC condition-based entity permissions on UpdateUserHandler', async () => {
      // Create user in engineering department
      const engEmail = newEmail();
      const engUser = await as(admin).post('/users').send({
        email: engEmail,
        name: 'Eng Target User',
        department: 'engineering',
      });
      expect(engUser.status).toBe(201);

      // Create user in sales department
      const salesEmail = newEmail();
      const salesUser = await as(admin).post('/users').send({
        email: salesEmail,
        name: 'Sales Target User',
        department: 'sales',
      });
      expect(salesUser.status).toBe(201);

      // Principal that can only update users in 'engineering' department
      const engManager = JSON.stringify({
        id: 'eng-mgr-1',
        email: 'engmgr@acme.test',
        department: 'engineering',
        capabilities: {
          roles: [],
          additionalCapabilities: ['User|update|{"department":"engineering"}'],
        },
      });

      // 1. Updating engineering user should SUCCEED
      const updateEngRes = await as(engManager)
        .patch(`/users/${engUser.body.id}`)
        .send({ name: 'Renamed Eng User' });
      expect(updateEngRes.status).toBe(200);
      expect(updateEngRes.body.name).toBe('Renamed Eng User');

      // 2. Updating sales user should be DENIED (403) by assertEntityPermission
      const updateSalesRes = await as(engManager)
        .patch(`/users/${salesUser.body.id}`)
        .send({ name: 'Renamed Sales User' });
      expect(updateSalesRes.status).toBe(403);
    });

    it('enforces field-level permissions on UpdateUserHandler', async () => {
      const email = newEmail();
      const created = await as(admin)
        .post('/users')
        .send({ email, name: 'Field Target', department: 'engineering' });
      expect(created.status).toBe(201);

      // Principal permitted to update ONLY the 'username' field (not department)
      const usernameOnlyUser = JSON.stringify({
        id: 'name-updater-1',
        email: 'nameupdater@acme.test',
        department: 'engineering',
        capabilities: {
          roles: [],
          additionalCapabilities: ['User|update|*|username'],
        },
      });

      // 1. Updating name ONLY should SUCCEED (200)
      const nameRes = await as(usernameOnlyUser)
        .patch(`/users/${created.body.id}`)
        .send({ name: 'New Username Only' });
      expect(nameRes.status).toBe(200);
      expect(nameRes.body.name).toBe('New Username Only');

      // 2. Attempting to update 'department' should be DENIED (403)
      const deptRes = await as(usernameOnlyUser)
        .patch(`/users/${created.body.id}`)
        .send({ department: 'security' });
      expect(deptRes.status).toBe(403);
    });

    it('enforces inverted / denied capabilities on CreateUserHandler', async () => {
      // Principal with all|manage|* but explicitly denied User|create
      const userWithoutCreate = JSON.stringify({
        id: 'no-create-admin',
        email: 'nocreate@acme.test',
        department: 'platform',
        capabilities: {
          roles: [],
          additionalCapabilities: ['all|manage|*'],
          deniedCapabilities: [
            { subject: 'User', action: 'create', inverted: true },
          ],
        },
      });

      // 1. Can list users
      const listRes = await as(userWithoutCreate).get('/users');
      expect(listRes.status).toBe(200);

      // 2. Create is DENIED (403) due to inverted rule
      const createRes = await as(userWithoutCreate)
        .post('/users')
        .send({ email: newEmail(), name: 'Blocked By Inverted' });
      expect(createRes.status).toBe(403);
    });

    it('enforces inverted / denied capabilities on DeleteUserHandler', async () => {
      const email = newEmail();
      const created = await as(admin)
        .post('/users')
        .send({ email, name: 'Protected From Delete', department: 'platform' });
      expect(created.status).toBe(201);

      // Principal with all|manage|* but explicitly denied User|delete
      const userWithoutDelete = JSON.stringify({
        id: 'no-delete-admin',
        email: 'nodelete@acme.test',
        department: 'platform',
        capabilities: {
          roles: [],
          additionalCapabilities: ['all|manage|*'],
          deniedCapabilities: [
            { subject: 'User', action: 'delete', inverted: true },
          ],
        },
      });

      // 1. Can read user
      const getRes = await as(userWithoutDelete).get(
        `/users/${created.body.id}`,
      );
      expect(getRes.status).toBe(200);

      // 2. Delete is DENIED (403) by CaslBehavior on DeleteUserHandler
      const deleteRes = await as(userWithoutDelete).delete(
        `/users/${created.body.id}`,
      );
      expect(deleteRes.status).toBe(403);
    });

    it('resolves capabilities persisted in SQLite database tables (user_roles -> capabilities)', async () => {
      // 1. Create a user via API
      const userEmail = newEmail();
      const createRes = await as(admin).post('/users').send({
        email: userEmail,
        name: 'Db Capability User',
        department: 'engineering',
      });
      expect(createRes.status).toBe(201);
      const userId = createRes.body.id;

      // 2. Seed database with a role and capability directly
      const store = ctx.app.get<MikroOrmStore>(MIKRO_ORM_CLIENT);
      const em = store.em;

      const capId = randomUUID();
      const roleId = randomUUID();
      const now = Date.now();

      // Insert capability for User|read
      await em.execute(
        `INSERT INTO capabilities (id, created_at, updated_at, action, subject, conditions, inverted, reason, fields)
         VALUES (?, ?, ?, 'read', 'User', NULL, 0, NULL, NULL)`,
        [capId, now, now],
      );

      // Insert role
      await em.execute(
        `INSERT INTO roles (id, created_at, updated_at, name)
         VALUES (?, ?, ?, ?)`,
        [roleId, now, now, `db-role-${Date.now()}`],
      );

      // Link role to capability
      await em.execute(
        `INSERT INTO role_capabilities (role_id, capability_id) VALUES (?, ?)`,
        [roleId, capId],
      );

      // Link user to role
      await em.execute(
        `INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)`,
        [userId, roleId],
      );

      // 3. Authenticate with ONLY the user's ID (no inline capabilities)
      const sessionUserWithNoInlineCaps = JSON.stringify({
        id: userId,
        email: userEmail,
        department: 'engineering',
      });

      // CASL userCapabilityProvider (GetUserCapabilitiesQueryRepository) will load
      // the capabilities from the database!
      const getRes = await as(sessionUserWithNoInlineCaps).get(
        `/users/${userId}`,
      );
      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(userId);
    });
  });

  describe('@nestjs-pipeline/idempotency', () => {
    it('replays identical response for duplicate create request with same email key', async () => {
      const email = newEmail();
      const body = {
        email,
        name: 'Idempotency Test User',
        department: 'engineering',
      };

      const first = await as(admin).post('/users').send(body);
      const second = await as(admin).post('/users').send(body);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);
      expect(second.body.name).toBe(first.body.name);
    });

    it('rejects key reuse with a modified payload (422)', async () => {
      const email = newEmail();

      const first = await as(admin)
        .post('/users')
        .send({ email, name: 'Original Name', department: 'engineering' });

      const conflict = await as(admin)
        .post('/users')
        .send({ email, name: 'Different Name', department: 'engineering' });

      expect(first.status).toBe(201);
      expect(conflict.status).toBe(422);
      expect(conflict.body).toMatchObject({
        statusCode: 422,
        reason: 'key_reuse',
      });
    });
  });

  describe('@nestjs-pipeline/rate-limit', () => {
    it('throttles registrations exceeding 5 attempts within 60s (429)', async () => {
      const email = newEmail();

      // Send 5 create attempts with the same email.
      // Because RateLimitBehavior is placed BEFORE IdempotencyBehavior, all attempts count towards the rate limit.
      for (let i = 0; i < 5; i++) {
        await as(admin)
          .post('/users')
          .send({ email, name: `Rate User ${i}`, department: 'engineering' });
      }

      // 6th attempt should be throttled by RateLimitBehavior -> HTTP 429 Too Many Requests
      const throttled = await as(admin)
        .post('/users')
        .send({ email, name: 'Rate User 6', department: 'engineering' });

      expect(throttled.status).toBe(429);
      expect(throttled.body).toMatchObject({
        statusCode: 429,
        error: 'Too Many Requests',
      });
      expect(throttled.headers).toHaveProperty('retry-after');
    });
  });

  describe('@nestjs-pipeline/cache (Redis Query Caching)', () => {
    it('caches single-user query in Redis for 60s', async () => {
      const email = newEmail();
      const created = await as(admin)
        .post('/users')
        .send({ email, name: 'Cached User', department: 'engineering' });
      expect(created.status).toBe(201);
      const userId = created.body.id;

      // 1st request - fetches from database and populates Redis cache
      const firstGet = await as(admin).get(`/users/${userId}`);
      expect(firstGet.status).toBe(200);
      expect(firstGet.body.name).toBe('Cached User');

      // 2nd request - served from CacheBehavior in Redis
      const secondGet = await as(admin).get(`/users/${userId}`);
      expect(secondGet.status).toBe(200);
      expect(secondGet.body.id).toBe(userId);
    });
  });

  describe('@nestjs-pipeline/deadletter & BullMQ Event Queueing', () => {
    it('enqueues welcome-email job with stamped correlationId on UserCreatedEvent', async () => {
      const welcomeEmailQueue = ctx.app.get<Queue>(
        getQueueToken(WELCOME_EMAIL_QUEUE),
      );
      const email = newEmail();
      const customCorrId = `corr-welcome-${Date.now()}`;

      const created = await request(http)
        .post('/users')
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin)
        .set('x-correlation-id', customCorrId)
        .send({ email, name: 'Email Queue User', department: 'engineering' });

      expect(created.status).toBe(201);

      // Verify a job was added to the BullMQ welcome-email queue
      const jobs = await welcomeEmailQueue.getJobs([
        'waiting',
        'active',
        'completed',
        'delayed',
      ]);
      const matchingJob = jobs.find((j) => j.data?.email === email);

      expect(matchingJob).toBeDefined();
      expect(matchingJob?.data).toMatchObject({
        email,
        username: 'Email Queue User',
        userId: created.body.id,
        correlationId: customCorrId,
      });
    });

    it('enqueues batch-update-users job with stamped correlationId on UserUpdatedEvent', async () => {
      const batchQueue = ctx.app.get<Queue>(
        getQueueToken(BATCH_UPDATE_USERS_QUEUE),
      );
      const email = newEmail();

      const created = await as(admin)
        .post('/users')
        .send({ email, name: 'Batch User', department: 'engineering' });
      expect(created.status).toBe(201);

      const customCorrId = `corr-batch-${Date.now()}`;
      const updateRes = await request(http)
        .patch(`/users/${created.body.id}`)
        .set('x-tenant-schema', 'tenant')
        .set('x-test-user', admin)
        .set('x-correlation-id', customCorrId)
        .send({ name: 'Batch User Renamed' });

      expect(updateRes.status).toBe(200);

      // Verify job in batch queue
      const jobs = await batchQueue.getJobs([
        'waiting',
        'active',
        'completed',
        'delayed',
      ]);
      const matchingJob = jobs.find(
        (j) =>
          Array.isArray(j.data) &&
          j.data.some(
            (item: { userId: string }) => item.userId === created.body.id,
          ),
      );

      expect(matchingJob).toBeDefined();
    });
  });

  describe('@nestjs-pipeline/audit & resilience (DeleteUserHandler)', () => {
    it('executes delete with resilience policy and audit logging', async () => {
      const email = newEmail();
      const created = await as(admin)
        .post('/users')
        .send({ email, name: 'Audited Delete User', department: 'security' });
      expect(created.status).toBe(201);

      const delRes = await as(admin).delete(`/users/${created.body.id}`);
      expect(delRes.status).toBe(204);

      // Confirm deletion in uncached list
      const listRes = await as(admin).get('/users');
      expect(
        listRes.body.users.some(
          (u: { id: string }) => u.id === created.body.id,
        ),
      ).toBe(false);
    });
  });

  describe('@nestjs-pipeline/zod (Validation boundaries)', () => {
    it('validates payloads with Zod and returns 400 with fieldErrors', async () => {
      const res = await as(admin)
        .post('/users')
        .send({ email: 'bad-email-address', name: 'sh' });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('fieldErrors');
      expect(res.body.fieldErrors).toHaveProperty('email');
      expect(res.body.fieldErrors).toHaveProperty('name');
    });

    it('rejects UUID validation failures at parameter boundary (400)', async () => {
      const res = await as(admin).get('/users/invalid-uuid-1234');

      expect(res.status).toBe(400);
    });
  });
});
