/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { runWithCorrelationId } from '@nestjs-pipeline/correlation';
import type { TenantSchemaContext } from '@persistence/tenant-schema.context';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  SendWelcomeEmailProcessor,
  type WelcomeEmailJobData,
} from './send-welcome-email.processor';

vi.mock('@nestjs-pipeline/job-context', () => ({
  InJobContext: () => () => undefined,
}));

const tenantContext = { schema: 'tenant_alpha' } as TenantSchemaContext;

describe('SendWelcomeEmailProcessor', () => {
  it('demonstrates welcome email job execution without sending external emails', async () => {
    const processor = new SendWelcomeEmailProcessor(tenantContext);
    const logs: string[] = [];
    // biome-ignore lint/complexity/useLiteralKeys: for testing
    vi.spyOn(processor['logger'], 'log').mockImplementation((message) => {
      logs.push(String(message));
    });
    const job = {
      data: {
        userId: 'u-1',
        username: 'alice',
        email: 'alice@example.test',
      },
    } as unknown as Job<WelcomeEmailJobData>;

    const result = await runWithCorrelationId('corr-welcome-1', () =>
      processor.process(job),
    );

    expect(result).toEqual({
      simulated: true,
      emailSent: false,
      recipient: 'alice@example.test',
      userId: 'u-1',
    });
    expect(logs).toEqual([
      expect.stringContaining(
        'Demonstrating welcome email dispatch for alice@example.test',
      ),
    ]);
    expect(logs[0]).toContain('tenant: tenant_alpha');
    expect(logs[0]).toContain('corr-welcome-1');
    expect(logs[0]).toContain('No external email sent');
  });

  it('closes worker gracefully on module destroy', async () => {
    const processor = new SendWelcomeEmailProcessor(tenantContext);
    const mockWorker = { close: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(processor, 'worker', { value: mockWorker });

    await processor.onModuleDestroy();

    expect(mockWorker.close).toHaveBeenCalledWith();
  });

  it('handles onModuleDestroy safely when worker is not initialized', async () => {
    const processor = new SendWelcomeEmailProcessor(tenantContext);

    await expect(processor.onModuleDestroy()).resolves.toBeUndefined();
  });
});
