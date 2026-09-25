/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { TenantSchemaContext } from '@persistence/tenant-schema.context';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  SendWelcomeEmailProcessor,
  SimulatedSendWelcomeEmailProcessor,
  type WelcomeEmailJobData,
} from './send-welcome-email.processor';

describe('SimulatedSendWelcomeEmailProcessor', () => {
  it('exports SendWelcomeEmailProcessor as an alias for backwards compatibility', () => {
    expect(SendWelcomeEmailProcessor).toBe(SimulatedSendWelcomeEmailProcessor);
  });

  it('demonstrates welcome email job execution without sending external emails', async () => {
    let capturedTenant: string | undefined;
    const tenantContext = {
      run: (tenant: string | undefined, fn: () => unknown) => {
        capturedTenant = tenant;
        return fn();
      },
      schema: 'tenant_alpha',
    } as unknown as TenantSchemaContext;

    const processor = new SimulatedSendWelcomeEmailProcessor(tenantContext);
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
        tenant: 'tenant_alpha',
        correlationId: 'corr-welcome-1',
      },
    } as unknown as Job<WelcomeEmailJobData>;

    const result = await processor.process(job);

    expect(capturedTenant).toBe('tenant_alpha');
    expect(result).toEqual({
      simulated: true,
      emailSent: false,
      recipient: 'alice@example.test',
      userId: 'u-1',
    });
    expect(
      logs.some(
        (l) =>
          l.includes(
            'Demonstrating welcome email dispatch for alice@example.test',
          ) && l.includes('No external email sent'),
      ),
    ).toBe(true);
  });

  it('closes worker gracefully on module destroy', async () => {
    const tenantContext = {
      run: vi.fn(),
      schema: 'tenant_alpha',
    } as unknown as TenantSchemaContext;
    const processor = new SimulatedSendWelcomeEmailProcessor(tenantContext);
    const mockWorker = { close: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(processor, 'worker', { value: mockWorker });

    await processor.onModuleDestroy();

    expect(mockWorker.close).toHaveBeenCalledWith();
  });

  it('handles onModuleDestroy safely when worker is not initialized', async () => {
    const tenantContext = {
      run: vi.fn(),
      schema: 'tenant_alpha',
    } as unknown as TenantSchemaContext;
    const processor = new SimulatedSendWelcomeEmailProcessor(tenantContext);

    await expect(processor.onModuleDestroy()).resolves.toBeUndefined();
  });
});
