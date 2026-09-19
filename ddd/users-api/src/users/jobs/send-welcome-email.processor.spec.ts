/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { TenantSchemaContext } from '@persistence/tenant-schema.context';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  SendWelcomeEmailProcessor,
  type WelcomeEmailJobData,
} from './send-welcome-email.processor';

describe('SendWelcomeEmailProcessor', () => {
  it('processes welcome email job within tenant schema context and logs message', async () => {
    let capturedTenant: string | undefined;
    const tenantContext = {
      run: (tenant: string | undefined, fn: () => unknown) => {
        capturedTenant = tenant;
        return fn();
      },
      schema: 'tenant_alpha',
    } as unknown as TenantSchemaContext;

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
        tenant: 'tenant_alpha',
        correlationId: 'corr-welcome-1',
      },
    } as unknown as Job<WelcomeEmailJobData>;

    await processor.process(job);

    expect(capturedTenant).toBe('tenant_alpha');
    expect(
      logs.some((l) =>
        l.includes('Sending welcome email to alice@example.test'),
      ),
    ).toBe(true);
    expect(
      logs.some((l) => l.includes('Welcome email sent to alice@example.test')),
    ).toBe(true);
  });
});
