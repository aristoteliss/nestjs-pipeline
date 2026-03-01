import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { UserCreatedEvent } from './user-created.event';

@EventsHandler(UserCreatedEvent)
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  private readonly logger = new Logger(UserCreatedHandler.name);

  handle(event: UserCreatedEvent): void {
    this.logger.log(
      `📬 UserCreated — id: ${event.userId}, username: ${event.username}, email: ${event.email}`,
    );
  }
}
