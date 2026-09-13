import type { TenantSchemaContext } from '@persistence/tenant-schema.context';
import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import {
  type BatchUpdateUserItem,
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
        data,
        opts: { correlationId: 'corr-mixed' },
      } as unknown as Job<BatchUpdateUserItem[]>),
    ).rejects.toBeInstanceOf(MixedTenantBatchError);
    expect(run).not.toHaveBeenCalled();
  });

  it('resolves a homogeneous tenant without changing the payload contract', () => {
    expect(
      resolveBatchTenant([
        { userId: 'user-a', tenant: 'tenant_a' },
        { userId: 'user-b', tenant: 'tenant_a' },
      ]),
    ).toBe('tenant_a');
  });
});
