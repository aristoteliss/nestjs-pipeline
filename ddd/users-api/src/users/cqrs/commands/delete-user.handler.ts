/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, AuditBehavior } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { CommandBaseHandler, IWriteSideAggregateRepository } from '@nestjs-pipeline/ddd-core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import { isTransientPersistenceError } from '@persistence/is-transient-persistence-error';
import { User, type UserSnapshot } from '../../domain/models/user.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { DeleteUserCommand } from './delete-user.command';

@CommandHandler(DeleteUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [CaslBehavior, { rules: [{ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.USER }] }],
  [ResilienceBehavior, { handle: isTransientPersistenceError, retry: { maxAttempts: 3, backoff: { type: 'exponential', initialDelay: 100, maxDelay: 2_000 } }, circuitBreaker: { halfOpenAfter: 10_000, breaker: { type: 'consecutive', threshold: 5 } } }],
  [AuditBehavior, { action: AUDIT_ACTIONS.USER_DELETE, severity: AUDIT_SEVERITY.HIGH, actor: () => { const sessionUser = getSessionUserFromStore(); return sessionUser ? { id: sessionUser.id, email: sessionUser.email ?? undefined } : undefined; } }],
)
export class DeleteUserHandler extends CommandBaseHandler<DeleteUserCommand, User> {
  constructor(
    @Inject(COMMAND_REPOSITORY.deleteUser)
    private readonly commandRepository: IWriteSideAggregateRepository<User, UserSnapshot, null>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) { super(eventBus); }

  /** Loads the authoritative write-side snapshot before applying deletion. */
  async handle(command: DeleteUserCommand): Promise<User> {
    const snapshot = await this.commandRepository.findById(command.id);
    const user = snapshot ? User.fromJSON(snapshot) : null;
    if (!user) throw new NotFoundException('User not found');
    this.authorizer.authorize('delete', user);
    user.delete();
    await this.commandRepository.save(user);
    return user;
  }
}
