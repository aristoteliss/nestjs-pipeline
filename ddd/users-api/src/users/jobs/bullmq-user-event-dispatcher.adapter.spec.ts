import { describe, expect, it, vi } from 'vitest';
import { BullMqUserEventDispatcher } from './bullmq-user-event-dispatcher.adapter';

describe('BullMqUserEventDispatcher', () => {
  it('maps welcome-email application intent to BullMQ job data', async () => {
    const welcomeAdd = vi.fn().mockResolvedValue({ id: 'welcome-1' });
    const batchAdd = vi.fn();
    const adapter = new BullMqUserEventDispatcher(
      { add: welcomeAdd } as never,
      { add: batchAdd } as never,
    );

    await adapter.enqueueWelcomeEmail({
      userId: 'user-1',
      username: 'Alice',
      email: 'alice@example.test',
      tenant: 'tenant_a',
      correlationId: 'corr-1',
    });

    expect(welcomeAdd).toHaveBeenCalledWith('send', {
      userId: 'user-1',
      username: 'Alice',
      email: 'alice@example.test',
      tenant: 'tenant_a',
      correlationId: 'corr-1',
    });
  });

  it('maps user batch intent to BullMQ data and correlation options', async () => {
    const batchAdd = vi.fn().mockResolvedValue({ id: 'batch-1' });
    const adapter = new BullMqUserEventDispatcher(
      { add: vi.fn() } as never,
      { add: batchAdd } as never,
    );

    await adapter.enqueueUserBatch(
      [{ userId: 'user-1', username: 'Alice', tenant: 'tenant_a' }],
      'corr-2',
    );

    expect(batchAdd).toHaveBeenCalledWith(
      'batch-update',
      [{ userId: 'user-1', username: 'Alice', tenant: 'tenant_a' }],
      { correlationId: 'corr-2' },
    );
  });
});
