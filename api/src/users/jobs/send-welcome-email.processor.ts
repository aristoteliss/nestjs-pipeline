/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getCorrelationId } from '@cqrs-ddd/pipeline-correlation';
import {
  InJobContext,
  type WithJobContext,
} from '@cqrs-ddd/pipeline-job-context';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnModuleDestroy } from '@nestjs/common';
import { TenantSchemaContext } from '@persistence/tenant-schema.context.js';
import type { Job } from 'bullmq';

export const WELCOME_EMAIL_QUEUE = 'welcome-email';

export type WelcomeEmailJobData = WithJobContext<{
  userId: string;
  username: string;
  email: string;
}>;

export interface SimulatedWelcomeEmailResult {
  readonly simulated: true;
  readonly emailSent: false;
  readonly recipient: string;
  readonly userId: string;
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
      await this.worker.close();
    } catch {
      // Worker was not initialized or already closed.
    }
  }

  @InJobContext()
  async process(
    job: Job<WelcomeEmailJobData>,
  ): Promise<SimulatedWelcomeEmailResult> {
    this.logger.log(
      `[Simulated] Demonstrating welcome email dispatch for ${job.data.email} ` +
        `(user: ${job.data.username}, tenant: ${this.tenantContext.schema}, correlationId: ${getCorrelationId()}). No external email sent.`,
    );

    return {
      simulated: true,
      emailSent: false,
      recipient: job.data.email,
      userId: job.data.userId,
    };
  }
}
