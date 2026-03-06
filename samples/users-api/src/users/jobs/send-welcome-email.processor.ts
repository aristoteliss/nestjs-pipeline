import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WithCorrelation, getCorrelationId } from '@nestjs-pipeline/correlation';

export const WELCOME_EMAIL_QUEUE = 'welcome-email';

export interface WelcomeEmailJobData {
  userId: string;
  username: string;
  email: string;
}

@Processor(WELCOME_EMAIL_QUEUE)
export class SendWelcomeEmailProcessor extends WorkerHost {
  private readonly logger = new Logger(SendWelcomeEmailProcessor.name);

  @WithCorrelation()
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
