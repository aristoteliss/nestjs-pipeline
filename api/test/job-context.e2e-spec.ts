/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Server } from 'node:http';
import { getQueueToken } from '@nestjs/bullmq';
import { InvalidJobContextError } from '@nestjs-pipeline/job-context';
import type { Job, Queue } from 'bullmq';
import { decodeJwt } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SendWelcomeEmailProcessor,
  WELCOME_EMAIL_QUEUE,
  type WelcomeEmailJobData,
} from '../src/users/jobs/send-welcome-email.processor.js';
import {
  bootstrapE2E,
  E2E_LOGIN_CODE,
  type E2EContext,
} from './support/e2e-app.js';

const admin = JSON.stringify({ id: 'admin-1', grants: ['all|manage|*'] });

function cookiePair(res: request.Response, name: string): string {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  if (!cookie) throw new Error(`response set no ${name} cookie`);
  return cookie.split(';')[0];
}

async function waitForJob(
  queue: Queue,
  email: string,
): Promise<{ job: Job; state: string }> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const jobs = await queue.getJobs([
      'completed',
      'failed',
      'active',
      'waiting',
    ]);
    const job = jobs.find((candidate) => candidate.data?.email === email);
    const state = job && (await job.getState());
    if (job?.id && (state === 'completed' || state === 'failed')) {
      return { job: (await queue.getJob(job.id)) as Job, state };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`no finished job for ${email}`);
}

describe('job execution context (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;
  let queue: Queue;
  let processor: SendWelcomeEmailProcessor;

  const createUser = (email: string) =>
    request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email, name: 'Job Context User' });

  const job = (principal: Record<string, unknown>, tenantId = 'tenant') =>
    ({
      data: {
        userId: 'u-1',
        username: 'Job Context User',
        email: 'job-context@acme.test',
        jobContext: { tenantId, correlationId: 'corr-job-context', principal },
      },
    }) as unknown as Job<WelcomeEmailJobData>;

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;
    queue = ctx.app.get<Queue>(getQueueToken(WELCOME_EMAIL_QUEUE));
    processor = ctx.app.get(SendWelcomeEmailProcessor);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('runs a job enqueued by an API client in its tenant, correlation id and principal', async () => {
    const email = `job-context-client-${Date.now()}@acme.test`;
    const correlationId = `corr-job-client-${Date.now()}`;

    const created = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-api-id', 'api-admin-client')
      .set('x-api-key', 'admin-secret-key-12345')
      .set('x-correlation-id', correlationId)
      .send({ email, name: 'Client Job User' });
    expect(created.status).toBe(201);

    const { job: finished, state } = await waitForJob(queue, email);

    expect(state).toBe('completed');
    expect(finished.data.jobContext).toEqual({
      tenantId: 'tenant',
      correlationId,
      principal: { id: 'api-admin-client', type: 'service' },
    });
  }, 15000);

  it('fails a job whose principal is not a configured API client for its tenant', async () => {
    const email = `job-context-unknown-${Date.now()}@acme.test`;

    expect((await createUser(email)).status).toBe(201);
    const { job: failed, state } = await waitForJob(queue, email);

    expect(state).toBe('failed');
    expect(failed.failedReason).toContain(
      'the API client is no longer allowed in this tenant',
    );
  }, 15000);

  it('runs a user job while its session is active and refuses it after logout', async () => {
    const email = `job-context-user-${Date.now()}@acme.test`;
    const created = await createUser(email);
    const loggedIn = await request(http)
      .post('/auths/login')
      .set('x-tenant-schema', 'tenant')
      .send({ email, code: E2E_LOGIN_CODE });
    expect(loggedIn.status).toBe(200);
    const sessionId = decodeJwt(loggedIn.body.accessToken).sid as string;
    const principal = { id: created.body.id, type: 'user', sessionId };

    await expect(processor.process(job(principal))).resolves.toMatchObject({
      simulated: true,
    });

    const out = await request(http)
      .post('/auths/logout')
      .set('x-tenant-schema', 'tenant')
      .set('Cookie', cookiePair(loggedIn, 'refresh_token'));
    expect(out.status).toBe(204);

    await expect(processor.process(job(principal))).rejects.toThrow(
      'the user session is unknown, revoked or expired',
    );
  }, 15000);

  it('refuses a user reference that does not own the session it names', async () => {
    const email = `job-context-owner-${Date.now()}@acme.test`;
    await createUser(email);
    const loggedIn = await request(http)
      .post('/auths/login')
      .set('x-tenant-schema', 'tenant')
      .send({ email, code: E2E_LOGIN_CODE });
    const sessionId = decodeJwt(loggedIn.body.accessToken).sid as string;

    await expect(
      processor.process(
        job({
          id: '019488e0-0000-7000-8000-000000000001',
          type: 'user',
          sessionId,
        }),
      ),
    ).rejects.toThrow('the user session is unknown, revoked or expired');
  });

  it('refuses grants written into the payload and a tenant outside the configured list', async () => {
    await expect(
      processor.process(
        job({
          id: 'api-admin-client',
          type: 'service',
          grants: ['all|manage|*'],
        }),
      ),
    ).rejects.toBeInstanceOf(InvalidJobContextError);
    await expect(
      processor.process(
        job({ id: 'api-admin-client', type: 'service' }, 'tenant_z'),
      ),
    ).rejects.toThrow('tenantId is not a configured tenant');
  });

  it('refuses an API client in a tenant its configuration does not list', async () => {
    await expect(
      processor.process(
        job({ id: 'api-tenant-b-only-client', type: 'service' }, 'tenant_a'),
      ),
    ).rejects.toThrow('the API client is no longer allowed in this tenant');
  });
});
