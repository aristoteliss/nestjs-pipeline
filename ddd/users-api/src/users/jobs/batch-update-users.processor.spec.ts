/* Copyright (C) 2026-present Aristotelis — see repository license. */
import type { TenantSchemaContext } from '@persistence/tenant-schema.context';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  type BatchUpdateUserItem,
  type BatchUpdateUsersJobData,
  BatchUpdateUsersProcessor,
  MixedTenantBatchError,
  resolveBatchTenant,
} from './batch-update-users.processor';

describe('BatchUpdateUsersProcessor tenant isolation', () => {
  it('rejects a mixed-tenant batch before entering TenantSchemaContext', async () => {
    const run = vi.fn();
    const tenantContext = {
      run,
      schema: 'tenant_a',
    } as unknown as TenantSchemaContext;
    const processor = new BatchUpdateUsersProcessor(tenantContext);
    const data: BatchUpdateUserItem[] = [
      { userId: 'user-a', tenant: 'tenant_a' },
      { userId: 'user-b', tenant: 'tenant_b' },
    ];

    await expect(
      processor.process({
        data: { items: data, correlationId: 'corr-mixed' },
      } as unknown as Job<BatchUpdateUsersJobData>),
    ).rejects.toBeInstanceOf(MixedTenantBatchError);
    expect(run).not.toHaveBeenCalled();
  });

  it('reads the correlation ID from the payload and runs the batch under it', async () => {
    const tenantContext = {
      run: (_tenant: string | undefined, fn: () => unknown) => fn(),
      schema: 'tenant_a',
    } as unknown as TenantSchemaContext;
    const processor = new BatchUpdateUsersProcessor(tenantContext);
    let observed: string | undefined;
    // biome-ignore lint/complexity/useLiteralKeys: for testing
    vi.spyOn(processor['logger'], 'log').mockImplementation((message) => {
      observed ??= String(message);
    });

    await processor.process({
      data: {
        items: [{ userId: 'user-a', tenant: 'tenant_a' }],
        correlationId: 'corr-payload',
      },
    } as unknown as Job<BatchUpdateUsersJobData>);

    expect(observed).toContain('corr-payload');
  });

  it('resolves a homogeneous tenant without changing the payload contract', () => {
    expect(
      resolveBatchTenant([
        { userId: 'user-a', tenant: 'tenant_a' },
        { userId: 'user-b', tenant: 'tenant_a' },
      ]),
    ).toBe('tenant_a');
  });

  it('closes worker gracefully on module destroy', async () => {
    const tenantContext = {
      run: vi.fn(),
      schema: 'tenant_a',
    } as unknown as TenantSchemaContext;
    const processor = new BatchUpdateUsersProcessor(tenantContext);
    const mockWorker = { close: vi.fn().mockResolvedValue(undefined) };
    Object.defineProperty(processor, 'worker', { value: mockWorker });

    await processor.onModuleDestroy();

    expect(mockWorker.close).toHaveBeenCalledWith();
  });

  it('handles onModuleDestroy safely when worker is not initialized', async () => {
    const tenantContext = {
      run: vi.fn(),
      schema: 'tenant_a',
    } as unknown as TenantSchemaContext;
    const processor = new BatchUpdateUsersProcessor(tenantContext);

    await expect(processor.onModuleDestroy()).resolves.toBeUndefined();
  });
});
