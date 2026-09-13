import type { Job } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  BatchUpdateUsersProcessor,
  MixedTenantBatchError,
  type BatchUpdateUserItem,
} from '../src/users/jobs/batch-update-users.processor';
import { bootstrapE2E, type E2EContext } from './support/e2e-app';

/** E2E regression coverage for Architecture.md finding #17. */
describe('batch user update tenant integrity (e2e)', () => {
  let ctx: E2EContext;
  let processor: BatchUpdateUsersProcessor;

  beforeAll(async () => {
    ctx = await bootstrapE2E({ tenants: ['tenant_a', 'tenant_b'] });
    processor = ctx.app.get(BatchUpdateUsersProcessor);
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it('rejects a mixed-tenant production job before processing it', async () => {
    const data: BatchUpdateUserItem[] = [
      { userId: '019488e0-0000-7000-8000-000000000001', tenant: 'tenant_a' },
      { userId: '019488e0-0000-7000-8000-000000000002', tenant: 'tenant_b' },
    ];

    await expect(
      processor.process({
        data,
        opts: { correlationId: 'e2e-mixed-tenant-batch' },
      } as Job<BatchUpdateUserItem[]>),
    ).rejects.toBeInstanceOf(MixedTenantBatchError);
  });
});
