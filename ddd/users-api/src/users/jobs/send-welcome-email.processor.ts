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
export class SendWelcomeEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(SendWelcomeEmailProcessor.name);

  constructor(private readonly tenantContext: TenantSchemaContext) {
    super();
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
