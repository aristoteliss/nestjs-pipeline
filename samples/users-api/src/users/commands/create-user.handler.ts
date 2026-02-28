import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { CreateUserCommand } from './create-user.command';
import { UserCreatedEvent } from '../events/user-created.event';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';

export interface UserDto {
  id: string;
  name: string;
  email: string;
}

/** In-memory store shared across the request lifecycle (demo only). */
export const usersStore = new Map<string, UserDto>();

@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }]
)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, UserDto> {
  constructor(private readonly eventBus: EventBus) {}

  async execute(command: CreateUserCommand): Promise<UserDto> {
    const user: UserDto = {
      id: crypto.randomUUID(),
      name: command.name,
      email: command.email,
    };

    usersStore.set(user.id, user);

    // Publish domain event — picked up by UserCreatedHandler
    this.eventBus.publish(new UserCreatedEvent(user.id, user.name, user.email));

    return user;
  }
}


