import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateUserCommand } from './create-user.command';
import { UserCreatedEvent } from '../events/user-created.event';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { User } from '../../domain/user.entity';
import { IUserRepository, USER_REPOSITORY } from '../../repositories/user.repository.interface';

@CommandHandler(CreateUserCommand)
@UsePipeline([
  LoggingBehavior,
  { requestResponseLogLevel: 'log' },
])
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const user = User.create(command.username, command.email);
    this.userRepository.save(user);

    this.eventBus.publish(new UserCreatedEvent({ 
      userId: user.id, 
      username: user.username, 
      email: user.email 
    }));

    return user;
  }
}