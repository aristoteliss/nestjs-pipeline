/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
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

@Processor(BATCH_UPDATE_USERS_QUEUE)
export class BatchUpdateUsersProcessor extends WorkerHost {
  private readonly logger = new Logger(BatchUpdateUsersProcessor.name);

  constructor(private readonly tenantContext: TenantSchemaContext) {
    super();
  }

  @WithCorrelation({ path: 'opts.correlationId' })
  async process(
    job: Job<BatchUpdateUserItem[]>,
    _token?: string,
  ): Promise<void> {
    const items = job.data;
    const tenant = items[0]?.tenant;

    return this.tenantContext.run(tenant, async () => {
      const correlationId = getCorrelationId();

      this.logger.log(
        `🔄 Batch updating ${items.length} users (tenant: ${this.tenantContext.schema}, correlationId: ${correlationId})`,
      );

      for (const item of items) {
        this.logger.debug(
          `  → Updating user ${item.userId} (correlationId: ${correlationId})`,
        );
        // Simulate update delay
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      this.logger.log(
        `✅ Batch update complete for ${items.length} users (correlationId: ${correlationId})`,
      );
    });
  }
}
