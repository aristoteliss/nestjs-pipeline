import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DeleteUserCommand } from './delete-user.command';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { IUserRepository, USER_REPOSITORY } from '../../repositories/user.repository.interface';

@CommandHandler(DeleteUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class DeleteUserHandler implements ICommandHandler<DeleteUserCommand, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(command: DeleteUserCommand): Promise<void> {
    this.userRepository.delete(command.id);
  }
}
