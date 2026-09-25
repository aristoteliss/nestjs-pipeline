/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { runWithCorrelationId } from '@nestjs-pipeline/correlation';
import { describe, expect, it, vi } from 'vitest';
import { BullMqUserEventDispatcher } from './bullmq-user-event-dispatcher.adapter';

describe('BullMqUserEventDispatcher', () => {
  it('adds correlation metadata to welcome-email BullMQ job data', async () => {
    const welcomeAdd = vi.fn().mockResolvedValue({ id: 'welcome-1' });
    const adapter = new BullMqUserEventDispatcher(
      { add: welcomeAdd } as never,
      { add: vi.fn() } as never,
    );

    await runWithCorrelationId('corr-1', () =>
      adapter.enqueueWelcomeEmail({
        userId: 'user-1',
        username: 'Alice',
        email: 'alice@example.test',
        tenant: 'tenant_a',
      }),
    );

    expect(welcomeAdd).toHaveBeenCalledWith('send', {
      userId: 'user-1',
      username: 'Alice',
      email: 'alice@example.test',
      tenant: 'tenant_a',
      correlationId: 'corr-1',
    });
  });

  it('stamps the batch correlation ID into the payload, not into JobsOptions', async () => {
    const batchAdd = vi.fn().mockResolvedValue({ id: 'batch-1' });
    const adapter = new BullMqUserEventDispatcher(
      { add: vi.fn() } as never,
      { add: batchAdd } as never,
    );

    await runWithCorrelationId('corr-2', () =>
      adapter.enqueueUserBatch([
        { userId: 'user-1', username: 'Alice', tenant: 'tenant_a' },
      ]),
    );

    expect(batchAdd).toHaveBeenCalledWith('batch-update', {
      items: [{ userId: 'user-1', username: 'Alice', tenant: 'tenant_a' }],
      correlationId: 'corr-2',
    });
    expect(batchAdd.mock.calls[0]).toHaveLength(2);
  });

  it('copies the batch items rather than enqueuing the caller array', async () => {
    const batchAdd = vi.fn().mockResolvedValue({ id: 'batch-2' });
    const adapter = new BullMqUserEventDispatcher(
      { add: vi.fn() } as never,
      { add: batchAdd } as never,
    );
    const item = { userId: 'user-1', tenant: 'tenant_a' };

    await adapter.enqueueUserBatch([item]);

    expect(batchAdd.mock.calls[0][1].items[0]).not.toBe(item);
    expect(batchAdd.mock.calls[0][1].items[0]).toEqual(item);
  });
});
