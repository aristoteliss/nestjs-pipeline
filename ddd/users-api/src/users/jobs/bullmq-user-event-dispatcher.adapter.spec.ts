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

  it('adds correlation metadata to user-batch BullMQ job options', async () => {
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

    expect(batchAdd).toHaveBeenCalledWith(
      'batch-update',
      [{ userId: 'user-1', username: 'Alice', tenant: 'tenant_a' }],
      { correlationId: 'corr-2' },
    );
  });
});
