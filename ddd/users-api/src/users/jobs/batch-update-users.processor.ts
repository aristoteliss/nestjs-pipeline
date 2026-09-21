/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  getCorrelationId,
  WithCorrelation,
} from '@nestjs-pipeline/correlation';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import type { Job } from 'bullmq';

export const BATCH_UPDATE_USERS_QUEUE = 'batch-update-users';

export interface BatchUpdateUserItem {
  userId: string;
  username?: string;
  email?: string;
  tenant?: string;
}

/**
 * Batch job payload.
 *
 * The items are wrapped in an object so the correlation ID travels in the
 * payload, the way `@nestjs-pipeline/correlation` prescribes for transports
 * without headers. `addCorrelationId` refuses a bare array precisely because
 * there is nowhere on one to put the field.
 */
export interface BatchUpdateUsersJobData {
  items: BatchUpdateUserItem[];
  correlationId?: string;
}

export interface SimulatedBatchUpdateResult {
  readonly simulated: true;
  readonly rowsUpdated: 0;
  readonly itemCount: number;
}

/**
 * Raised when one batch attempts to cross tenant boundaries.
 *
 * A BullMQ job is one tenant-scoped unit of work. Mixing tenant identities in
 * one payload would otherwise select the first item's schema for every item.
 */
export class MixedTenantBatchError extends Error {
  constructor(readonly tenants: readonly (string | undefined)[]) {
    super('Batch update payload must contain users from exactly one tenant.');
    this.name = MixedTenantBatchError.name;
  }
}

/**
 * Resolves the tenant for a batch and rejects mixed-tenant payloads before any
 * tenant context is entered or work is performed.
 */
export function resolveBatchTenant(
  items: readonly BatchUpdateUserItem[],
): string | undefined {
  const tenant = items[0]?.tenant;
  if (items.some((item) => item.tenant !== tenant)) {
    throw new MixedTenantBatchError([
      ...new Set(items.map((item) => item.tenant)),
    ]);
  }
  return tenant;
}

@Processor(BATCH_UPDATE_USERS_QUEUE)
export class SimulatedBatchUpdateUsersProcessor
  extends WorkerHost
  implements OnModuleDestroy
{
  private readonly logger = new Logger(SimulatedBatchUpdateUsersProcessor.name);

  constructor(private readonly tenantContext: TenantSchemaContext) {
    super();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.worker.close();
    } catch {
      // Worker was not initialized or already closed.
    }
  }

  @WithCorrelation({ path: 'data.correlationId' })
  async process(
    job: Job<BatchUpdateUsersJobData>,
    _token?: string,
  ): Promise<SimulatedBatchUpdateResult> {
    const items = job.data.items;
    // Validate the entire payload before choosing a schema. Never infer tenant
    // ownership from only the first item in a multi-tenant batch.
    const tenant = resolveBatchTenant(items);

    return this.tenantContext.run(tenant, async () => {
      const correlationId = getCorrelationId();

      this.logger.log(
        `[Simulated] Demonstrating batch update for ${items.length} users ` +
          `(tenant: ${this.tenantContext.schema}, correlationId: ${correlationId}). No database rows updated.`,
      );

      return {
        simulated: true,
        rowsUpdated: 0,
        itemCount: items.length,
      };
    });
  }
}

export { SimulatedBatchUpdateUsersProcessor as BatchUpdateUsersProcessor };
