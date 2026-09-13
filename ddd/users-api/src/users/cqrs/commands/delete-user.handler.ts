/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import { isTransientOperationError } from '@common/resilience/transient-operation.error';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, AuditBehavior } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  EntityNotFoundException,
  IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core';
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
    ResilienceBehavior,
    {
      retry: {
        maxAttempts: 3,
        backoff: 'exponential',
        initialDelayMs: 25,
        maxDelayMs: 100,
        isRetryable: isTransientOperationError,
      },
    },
  ],
  [
    AuditBehavior,
    {
      action: AUDIT_ACTIONS.DELETE_USER,
      severity: AUDIT_SEVERITY.HIGH,
      metadataFactory: (ctx) => {
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

  /**
   * Loads authoritative write-side state and expresses absence as a framework-neutral
   * application error before authorization and domain deletion are attempted.
   * Retryability is supplied by the repository through `TransientOperationError`;
   * this handler does not inspect persistence-specific driver codes.
   */
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
