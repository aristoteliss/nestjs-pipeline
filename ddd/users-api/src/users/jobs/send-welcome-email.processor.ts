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

export interface SimulatedWelcomeEmailResult {
  readonly simulated: true;
  readonly emailSent: false;
  readonly recipient: string;
  readonly userId: string;
}

@Processor(WELCOME_EMAIL_QUEUE)
export class SimulatedSendWelcomeEmailProcessor
  extends WorkerHost
  implements OnModuleDestroy
{
  private readonly logger = new Logger(SimulatedSendWelcomeEmailProcessor.name);

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

  @WithCorrelation({
    extract: (job: Job, _token: string) => job.data.correlationId,
  } as CorrelationDecoratorOptions)
  async process(
    job: Job<WelcomeEmailJobData>,
  ): Promise<SimulatedWelcomeEmailResult> {
    return this.tenantContext.run(job.data.tenant, async () => {
      const correlationId = getCorrelationId();

      this.logger.log(
        `[Simulated] Demonstrating welcome email dispatch for ${job.data.email} ` +
          `(user: ${job.data.username}, tenant: ${this.tenantContext.schema}, correlationId: ${correlationId}). No external email sent.`,
      );

      return {
        simulated: true,
        emailSent: false,
        recipient: job.data.email,
        userId: job.data.userId,
      };
    });
  }
}

export { SimulatedSendWelcomeEmailProcessor as SendWelcomeEmailProcessor };
