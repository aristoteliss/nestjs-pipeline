/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { withJobContext } from '@cqrs-ddd/pipeline-job-context';
import { describe, expect, it, vi } from 'vitest';
import { BullMqUserEventDispatcher } from './bullmq-user-event-dispatcher.adapter.js';

vi.mock('@cqrs-ddd/pipeline-job-context', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cqrs-ddd/pipeline-job-context')>()),
  withJobContext: vi.fn((data: object) => ({
    ...data,
    jobContext: {
      tenantId: 'tenant_a',
      correlationId: 'corr-1',
      principal: { id: 'u-1', type: 'user', sessionId: 's-1' },
    },
  })),
}));

const jobContext = {
  tenantId: 'tenant_a',
  correlationId: 'corr-1',
  principal: { id: 'u-1', type: 'user', sessionId: 's-1' },
};

describe('BullMqUserEventDispatcher', () => {
  it('stamps the job context on welcome-email job data', async () => {
    const welcomeAdd = vi.fn().mockResolvedValue({ id: 'welcome-1' });
    const adapter = new BullMqUserEventDispatcher(
      { add: welcomeAdd } as never,
      { add: vi.fn() } as never,
    );

    await adapter.enqueueWelcomeEmail({
      userId: 'user-1',
      username: 'Alice',
      email: 'alice@example.test',
    });

    expect(welcomeAdd).toHaveBeenCalledWith('send', {
      userId: 'user-1',
      username: 'Alice',
      email: 'alice@example.test',
      jobContext,
    });
  });

  it('stamps the job context beside the batch items, not into JobsOptions', async () => {
    const batchAdd = vi.fn().mockResolvedValue({ id: 'batch-1' });
    const adapter = new BullMqUserEventDispatcher(
      { add: vi.fn() } as never,
      { add: batchAdd } as never,
    );

    await adapter.enqueueUserBatch([{ userId: 'user-1', username: 'Alice' }]);

    expect(batchAdd).toHaveBeenCalledWith('batch-update', {
      items: [{ userId: 'user-1', username: 'Alice' }],
      jobContext,
    });
    expect(batchAdd.mock.calls[0]).toHaveLength(2);
  });

  it('copies the batch items rather than enqueuing the caller array', async () => {
    const batchAdd = vi.fn().mockResolvedValue({ id: 'batch-2' });
    const adapter = new BullMqUserEventDispatcher(
      { add: vi.fn() } as never,
      { add: batchAdd } as never,
    );
    const item = { userId: 'user-1' };

    await adapter.enqueueUserBatch([item]);

    expect(withJobContext).toHaveBeenCalled();
    expect(batchAdd.mock.calls[0][1].items[0]).not.toBe(item);
    expect(batchAdd.mock.calls[0][1].items[0]).toEqual(item);
  });
});
