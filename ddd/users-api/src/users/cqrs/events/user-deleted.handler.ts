import { Logger } from '@nestjs/common';
import { EventsHandler, type IEventHandler } from '@nestjs/cqrs';
import { getCorrelationId } from '@nestjs-pipeline/correlation';
import { UserDeletedEvent } from '../../domain/events/user-deleted.event';

@EventsHandler(UserDeletedEvent)
export class UserDeletedHandler implements IEventHandler<UserDeletedEvent> {
  private readonly logger = new Logger(UserDeletedHandler.name);

  async handle(event: UserDeletedEvent): Promise<void> {
    const {
      entity: { id: userId, username },
    } = event;

    const correlationId = getCorrelationId();

    this.logger.log(
      `📬 [${correlationId}] UserDeleted — id: ${userId}, username: ${username}`,
    );
  }
}
