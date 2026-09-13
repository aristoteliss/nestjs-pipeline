/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { Inject, Scope } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  EntityNotFoundException,
  IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core';
import { User, type UserSnapshot } from '../../domain/models/user.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { UpdateUserCommand } from './update-user.command';

@CommandHandler(UpdateUserCommand, { scope: Scope.REQUEST })
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    { rules: [{ action: APP_ACTIONS.UPDATE, subject: APP_SUBJECTS.USER }] },
  ],
)
export class UpdateUserHandler extends CommandBaseHandler<
  UpdateUserCommand,
  User
> {
  constructor(
    @Inject(COMMAND_REPOSITORY.updateUser)
    private readonly commandRepository: IWriteSideAggregateRepository<
      User,
      UserSnapshot,
      UserSnapshot
    >,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  /**
   * Loads authoritative write-side state, rejects absence with a framework-neutral
   * application error, authorizes the real aggregate, then applies the mutation.
   */
  async handle(command: UpdateUserCommand): Promise<User> {
    const { id, username, department } = command;
    const snapshot = await this.commandRepository.findById(id);
    const user = snapshot ? User.fromJSON(snapshot) : null;
    if (!user) {
      throw new EntityNotFoundException('User', id);
    }

    const changedFields = Object.entries({ username, department })
      .filter(([, value]) => value !== undefined)
      .map(([field]) => field);
    this.authorizer.authorize('update', user, changedFields);
    user.update({ username, department });
    await this.commandRepository.save(user);
    return user;
  }
}
