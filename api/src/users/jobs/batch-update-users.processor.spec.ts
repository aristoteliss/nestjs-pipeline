/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { runWithCorrelationId } from '@nestjs-pipeline/correlation';
import type { TenantSchemaContext } from '@persistence/tenant-schema.context.js';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  type BatchUpdateUsersJobData,
  BatchUpdateUsersProcessor,
} from './batch-update-users.processor.js';

vi.mock('@nestjs-pipeline/job-context', () => ({
  InJobContext: () => () => undefined,
}));

const tenantContext = { schema: 'tenant_a' } as TenantSchemaContext;

describe('BatchUpdateUsersProcessor', () => {
  it('logs the active tenant and correlation id and updates no rows', async () => {
    const processor = new BatchUpdateUsersProcessor(tenantContext);
    let observed: string | undefined;
    // biome-ignore lint/complexity/useLiteralKeys: for testing
    vi.spyOn(processor['logger'], 'log').mockImplementation((message) => {
      observed ??= String(message);
    });

    const result = await runWithCorrelationId('corr-batch', () =>
      processor.process({
        data: { items: [{ userId: 'user-a' }] },
      } as unknown as Job<BatchUpdateUsersJobData>),
    );

    expect(observed).toContain('tenant: tenant_a');
    expect(observed).toContain('corr-batch');
    expect(observed).toContain('No database rows updated');
    expect(result).toEqual({
      simulated: true,
      rowsUpdated: 0,
      itemCount: 1,
    });
  });

  it('closes worker gracefully on module destroy', async () => {
    const processor = new BatchUpdateUsersProcessor(tenantContext);
    const mockWorker = { close: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(processor, 'worker', { value: mockWorker });

    await processor.onModuleDestroy();

    expect(mockWorker.close).toHaveBeenCalledWith();
  });

  it('handles onModuleDestroy safely when worker is not initialized', async () => {
    const processor = new BatchUpdateUsersProcessor(tenantContext);

    await expect(processor.onModuleDestroy()).resolves.toBeUndefined();
  });
});
