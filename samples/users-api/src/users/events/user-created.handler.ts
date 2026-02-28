import { EventsHandler, IEventHandler } from '@nestjs/cqrs';
import { Logger } from '@nestjs/common';
import { UserCreatedEvent } from './user-created.event';

/**
 * Handles UserCreatedEvent published by CreateUserHandler.
 *
 * In a real app this is where you'd send a welcome email, update a read-model,
 * emit an analytics event, etc.
 */
@EventsHandler(UserCreatedEvent)
export class UserCreatedHandler implements IEventHandler<UserCreatedEvent> {
  private readonly logger = new Logger(UserCreatedHandler.name);

  handle(event: UserCreatedEvent): void {
    this.logger.log(
      `📬 UserCreated — id: ${event.userId}, name: ${event.name}, email: ${event.email}`,
    );
  }
}
