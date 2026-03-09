import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { JobsOptions, Queue } from 'bullmq';
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { UserUpdatedEvent } from './user-updated.event';
import { BATCH_UPDATE_USERS_QUEUE, BatchUpdateUserItem } from '../../jobs/batch-update-users.processor';

@EventsHandler(UserUpdatedEvent)
export class UserUpdatedHandler implements IEventHandler<UserUpdatedEvent> {
  private readonly logger = new Logger(UserUpdatedHandler.name);

  constructor(
    @InjectQueue(BATCH_UPDATE_USERS_QUEUE)
    private readonly batchUpdateQueue: Queue<BatchUpdateUserItem[]>,
  ) {}

  async handle(event: UserUpdatedEvent): Promise<void> {
    const { userId, username } = event;
    const correlationId = getCorrelationId();

    this.logger.log(
      `📬 [${correlationId}] UserUpdated — id: ${userId}, username: ${username}`,
    );

    const items: BatchUpdateUserItem[] = [{ userId, username }];

    await this.batchUpdateQueue.add(
      'batch-update',
      items,
      { ...({ correlationId }) } as JobsOptions & { correlationId: string },
    );

    this.logger.log(
      `📤 [${correlationId}] Enqueued batch-update job for user ${userId}`,
    );
  }
}
