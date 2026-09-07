/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject, NotFoundException, Scope } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { CommandBaseHandler, IWriteSideAggregateRepository } from '@nestjs-pipeline/ddd-core';
import { User, type UserSnapshot } from '../../domain/models/user.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { UpdateUserCommand } from './update-user.command';

@CommandHandler(UpdateUserCommand, { scope: Scope.REQUEST })
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [CaslBehavior, { rules: [{ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.USER }] }],
)
export class UpdateUserHandler extends CommandBaseHandler<UpdateUserCommand, User> {
  constructor(
    @Inject(COMMAND_REPOSITORY.updateUser)
    private readonly commandRepository: IWriteSideAggregateRepository<User, UserSnapshot, UserSnapshot>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) { super(eventBus); }

  /** Loads the authoritative write-side snapshot before applying a mutation. */
  async handle(command: UpdateUserCommand): Promise<User> {
    const { id, username, department } = command;
    const snapshot = await this.commandRepository.findById(id);
    const user = snapshot ? User.fromJSON(snapshot) : null;
    if (!user) throw new NotFoundException('User not found');

    const changedFields = Object.entries({ username, department })
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field);
    this.authorizer.authorize('update', user, changedFields);
    user.update({ username, department });
    await this.commandRepository.save(user);
    return user;
  }
}
