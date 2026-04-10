import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  getCorrelationId,
  WithCorrelation,
} from '@nestjs-pipeline/correlation';
import type { Job } from 'bullmq';

export const BATCH_UPDATE_USERS_QUEUE = 'batch-update-users';

export interface BatchUpdateUserItem {
  userId: string;
  username?: string;
  email?: string;
}

@Processor(BATCH_UPDATE_USERS_QUEUE)
export class BatchUpdateUsersProcessor extends WorkerHost {
  private readonly logger = new Logger(BatchUpdateUsersProcessor.name);

  @WithCorrelation({ path: 'opts.correlationId' })
  async process(
    job: Job<BatchUpdateUserItem[]>,
    _token?: string,
  ): Promise<void> {
    const correlationId = getCorrelationId();
    const items = job.data;

    this.logger.log(
      `🔄 Batch updating ${items.length} users (correlationId: ${correlationId})`,
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
  }
}
