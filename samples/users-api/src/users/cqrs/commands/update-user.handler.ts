import { Scope, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpdateUserCommand } from './update-user.command';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { User } from '../../domain/user.entity';
import { IUserRepository, USER_REPOSITORY } from '../../repositories/user.repository.interface';

@CommandHandler(UpdateUserCommand, { scope: Scope.REQUEST })
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }]
)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(command: UpdateUserCommand): Promise<User> {
    const user = this.userRepository.findById(command.id);
    user.rename(command.username);
    this.userRepository.save(user);
    return user;
  }
}