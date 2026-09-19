/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import {
  CorrelationDecoratorOptions,
  getCorrelationId,
  WithCorrelation,
} from '@nestjs-pipeline/correlation';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import type { Job } from 'bullmq';

export const WELCOME_EMAIL_QUEUE = 'welcome-email';

export interface WelcomeEmailJobData {
  userId: string;
  username: string;
  email: string;
  tenant?: string;
  correlationId?: string;
}

@Processor(WELCOME_EMAIL_QUEUE)
export class SendWelcomeEmailProcessor
  extends WorkerHost
  implements OnModuleDestroy
{
  private readonly logger = new Logger(SendWelcomeEmailProcessor.name);

  constructor(private readonly tenantContext: TenantSchemaContext) {
    super();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.worker.close(true);
    } catch {
      // Worker was not initialized or already closed.
    }
  }

  @WithCorrelation({
    extract: (job: Job, _token: string) => job.data.correlationId,
  } as CorrelationDecoratorOptions)
  async process(job: Job<WelcomeEmailJobData>): Promise<void> {
    return this.tenantContext.run(job.data.tenant, async () => {
      const correlationId = getCorrelationId();

      this.logger.log(
        `📧 Sending welcome email to ${job.data.email} ` +
          `(user: ${job.data.username}, tenant: ${this.tenantContext.schema}, correlationId: ${correlationId})`,
      );

      // Simulate email sending delay
      await new Promise((resolve) => setTimeout(resolve, 100));

      this.logger.log(
        `✅ Welcome email sent to ${job.data.email} (correlationId: ${correlationId})`,
      );
    });
  }
}
