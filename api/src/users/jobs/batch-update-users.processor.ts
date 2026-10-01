/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import {
  InJobContext,
  type WithJobContext,
} from '@nestjs-pipeline/job-context';
import { TenantSchemaContext } from '@persistence/tenant-schema.context.js';
import type { Job } from 'bullmq';

export const BATCH_UPDATE_USERS_QUEUE = 'batch-update-users';

export interface BatchUpdateUserItem {
  userId: string;
  username?: string;
  email?: string;
}

/**
 * Batch job payload. The items are wrapped in an object so the job context
 * travels beside them; one batch runs in one tenant.
 */
export type BatchUpdateUsersJobData = WithJobContext<{
  items: BatchUpdateUserItem[];
}>;

export interface SimulatedBatchUpdateResult {
  readonly simulated: true;
  readonly rowsUpdated: 0;
  readonly itemCount: number;
}

@Processor(BATCH_UPDATE_USERS_QUEUE)
export class BatchUpdateUsersProcessor
  extends WorkerHost
  implements OnModuleDestroy
{
  private readonly logger = new Logger(BatchUpdateUsersProcessor.name);

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

  @InJobContext()
  async process(
    job: Job<BatchUpdateUsersJobData>,
    _token?: string,
  ): Promise<SimulatedBatchUpdateResult> {
    const items = job.data.items;
    this.logger.log(
      `[Simulated] Demonstrating batch update for ${items.length} users ` +
        `(tenant: ${this.tenantContext.schema}, correlationId: ${getCorrelationId()}). No database rows updated.`,
    );
    return {
      simulated: true,
      rowsUpdated: 0,
      itemCount: items.length,
    };
  }
}
