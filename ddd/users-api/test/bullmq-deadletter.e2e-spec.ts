/* Copyright (C) 2026-present Aristotelis — see repository license. */

process.env.TESTCONTAINERS_RYUK_DISABLED = 'true';

import type { Server } from 'node:http';
import { getQueueToken } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IWelcomeEmailDispatcher } from '../src/users/application/ports/user-event-dispatcher.port';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

describe('BullMQ worker lifecycle & dead-letter queue (e2e)', () => {
  let ctx: E2EContext;
  let http: Server;
  let welcomeQueue: Queue;
  let deadLetterQueue: Queue;
  let originalDispatcher: IWelcomeEmailDispatcher;

  const admin = JSON.stringify({
    id: 'admin-1',
    email: 'admin@acme.test',
    department: 'platform',
    grants: ['all|manage|*'],
  });

  beforeAll(async () => {
    ctx = await bootstrapE2E();
    http = ctx.app.getHttpServer() as Server;

    const { WELCOME_EMAIL_DISPATCHER } = await import(
      '../src/users/application/ports/user-event-dispatcher.port'
    );
    const { WELCOME_EMAIL_QUEUE } = await import(
      '../src/users/jobs/send-welcome-email.processor'
    );

    welcomeQueue = ctx.app.get<Queue>(getQueueToken(WELCOME_EMAIL_QUEUE));
    deadLetterQueue = ctx.app.get<Queue>(getQueueToken('dead-letters'));
    originalDispatcher = ctx.app.get<IWelcomeEmailDispatcher>(
      WELCOME_EMAIL_DISPATCHER,
    );
  });

  afterAll(async () => {
    await new Promise((r) => setTimeout(r, 300));
    await ctx?.close();
  });

  it('dispatches welcome email job to BullMQ on user creation and processes it to completion', async () => {
    const email = `bullmq-worker-${Date.now()}@acme.test`;
    const correlationId = `corr-worker-${Date.now()}`;

    const res = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-correlation-id', correlationId)
      .set('x-test-user', admin)
      .send({ email, name: 'BullMQ Worker User' });

    expect(res.status).toBe(201);

    // Wait for the job to be enqueued and processed to completion by SendWelcomeEmailProcessor
    let completedJob: Job | undefined;
    for (let i = 0; i < 40; i++) {
      const jobs = await welcomeQueue.getJobs([
        'completed',
        'active',
        'waiting',
        'delayed',
      ]);
      const found = jobs.find((j) => j.data?.email === email);
      if (found) {
        const state = await found.getState();
        if (state === 'completed') {
          completedJob = found;
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(completedJob).toBeDefined();
    expect(completedJob?.data.email).toBe(email);
    expect(completedJob?.data.tenant).toBe('tenant');
    expect(completedJob?.data.correlationId).toBe(correlationId);
  }, 15000);

  it('captures unhandled event handler failures into dead-letters queue via DeadLetterBehavior', async () => {
    const email = `deadletter-fail-${Date.now()}@acme.test`;
    const correlationId = `corr-deadletter-${Date.now()}`;

    // Simulate downstream email failure in UserCreatedHandler
    const spy = vi
      .spyOn(originalDispatcher, 'enqueueWelcomeEmail')
      .mockRejectedValueOnce(new Error('Downstream email gateway timeout'));

    const res = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-correlation-id', correlationId)
      .set('x-test-user', admin)
      .send({ email, name: 'DeadLetter Fail User' });

    // Since UserCreatedHandler has rethrow: false, HTTP response is not interrupted
    expect(res.status).toBe(201);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();

    // Verify the failure was delivered to the dead-letters queue
    let deadLetterJob: Job | undefined;
    for (let i = 0; i < 40; i++) {
      const jobs = await deadLetterQueue.getJobs([
        'waiting',
        'completed',
        'active',
        'delayed',
      ]);
      const found = jobs.find(
        (j) =>
          j.data?.correlationId === correlationId &&
          j.data?.requestName === 'UserCreatedEvent',
      );
      if (found) {
        deadLetterJob = found;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(deadLetterJob).toBeDefined();
    expect(deadLetterJob?.name).toBe('dead-letter');
    expect(deadLetterJob?.data.requestKind).toBe('event');
    expect(deadLetterJob?.data.handlerName).toBe('UserCreatedHandler');
    expect(deadLetterJob?.data.error.name).toBe('Error');
    expect(deadLetterJob?.data.error.message).toBe(
      'Downstream email gateway timeout',
    );
    expect(deadLetterJob?.data.tenantId).toBe('tenant');
    expect(typeof deadLetterJob?.data.failedAt).toBe('string');
  }, 15000);

  it('does not send ignored errors like validation failures to dead-letters queue', async () => {
    const initialJobs = await deadLetterQueue.getJobs([
      'waiting',
      'completed',
      'active',
      'delayed',
    ]);
    const initialCount = initialJobs.length;

    // Send invalid payload triggering ZodValidationError
    const res = await request(http)
      .post('/users')
      .set('x-tenant-schema', 'tenant')
      .set('x-test-user', admin)
      .send({ email: 'not-an-email' });

    expect(res.status).toBe(400);

    // Wait briefly and verify count did not increase
    await new Promise((r) => setTimeout(r, 200));
    const currentJobs = await deadLetterQueue.getJobs([
      'waiting',
      'completed',
      'active',
      'delayed',
    ]);
    expect(currentJobs.length).toBe(initialCount);
  }, 15000);
});
