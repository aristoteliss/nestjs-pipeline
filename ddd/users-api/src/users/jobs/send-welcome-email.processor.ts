import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  CorrelationDecoratorOptions,
  getCorrelationId,
  WithCorrelation,
} from '@nestjs-pipeline/correlation';
import type { Job } from 'bullmq';

export const WELCOME_EMAIL_QUEUE = 'welcome-email';

export interface WelcomeEmailJobData {
  userId: string;
  username: string;
  email: string;
}

@Processor(WELCOME_EMAIL_QUEUE)
export class SendWelcomeEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(SendWelcomeEmailProcessor.name);

  @WithCorrelation({
    extract: (job: Job, _token: string) => job.data.correlationId,
  } as CorrelationDecoratorOptions)
  async process(job: Job<WelcomeEmailJobData>): Promise<void> {
    const correlationId = getCorrelationId();

    this.logger.log(
      `📧 Sending welcome email to ${job.data.email} ` +
        `(user: ${job.data.username}, correlationId: ${correlationId})`,
    );

    // Simulate email sending delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.logger.log(
      `✅ Welcome email sent to ${job.data.email} (correlationId: ${correlationId})`,
    );
  }
}
