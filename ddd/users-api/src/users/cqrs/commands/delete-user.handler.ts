/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, AuditBehavior } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import {
  type IPipelineContext,
  LoggingBehavior,
  UsePipeline,
} from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core/application';
import {
  EntityNotFoundException,
  isTransientOperationError,
} from '@nestjs-pipeline/ddd-core/domain';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import type { User } from '../../domain/models/user.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { DeleteUserCommand } from './delete-user.command';

@CommandHandler(DeleteUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    { rules: [{ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.USER }] },
  ],
  [
    AuditBehavior,
    {
      action: AUDIT_ACTIONS.USER_DELETE,
      severity: AUDIT_SEVERITY.HIGH,
      metadataFactory: (ctx: IPipelineContext) => {
        const cmd = ctx.request as DeleteUserCommand;
        const actor = getSessionUserFromStore();
        return cmd && actor
          ? {
              targetUserId: cmd.id,
              deletedByUserId: actor.id,
              deletedByEmail: actor.email,
            }
          : undefined;
      },
    },
  ],
  [
    ResilienceBehavior,
    {
      handle: isTransientOperationError,
      retry: {
        maxAttempts: 3,
        replaySafe: true,
        backoff: {
          type: 'exponential',
          initialDelay: 25,
          maxDelay: 100,
        },
      },
    },
  ],
)
export class DeleteUserHandler extends CommandBaseHandler<
  DeleteUserCommand,
  User
> {
  constructor(
    @Inject(COMMAND_REPOSITORY.deleteUser)
    private readonly commandRepository: IWriteSideAggregateRepository<User>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteUserCommand): Promise<User> {
    const user = await this.commandRepository.findById(command.id);
    if (!user) {
      throw new EntityNotFoundException('User', command.id);
    }
    this.authorizer.authorize('delete', user);
    user.delete();
    await this.commandRepository.save(user);
    return user;
  }
}
