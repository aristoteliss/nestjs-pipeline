/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { isTransientTechnicalError } from '@common/cqrs/resilience/is-transient-technical-error';
import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
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
import { User, type UserSnapshot } from '../../domain/models/user.entity';
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
      handle: isTransientTechnicalError,
      retry: {
        maxAttempts: 3,
        backoff: { type: 'exponential', initialDelay: 100, maxDelay: 2_000 },
      },
      circuitBreaker: {
        halfOpenAfter: 10_000,
        breaker: { type: 'consecutive', threshold: 5 },
      },
    },
  ],
  [
    AuditBehavior,
    {
      action: AUDIT_ACTIONS.USER_DELETE,
      severity: AUDIT_SEVERITY.HIGH,
      actor: () => {
        const sessionUser = getSessionUserFromStore();
        return sessionUser
          ? { id: sessionUser.id, email: sessionUser.email ?? undefined }
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
    private readonly commandRepository: IWriteSideAggregateRepository<
      User,
      UserSnapshot,
      null
    >,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  /**
   * Loads authoritative write-side state and expresses absence as a framework-neutral
   * application error before authorization and domain deletion are attempted.
   * Transient technical retries are selected by a neutral CQRS resilience policy.
   */
  async handle(command: DeleteUserCommand): Promise<User> {
    const snapshot = await this.commandRepository.findById(command.id);
    const user = snapshot ? User.fromJSON(snapshot) : null;
    if (!user) {
      throw new EntityNotFoundException('User', command.id);
    }
    this.authorizer.authorize('delete', user);
    user.delete();
    await this.commandRepository.save(user);
    return user;
  }
}
