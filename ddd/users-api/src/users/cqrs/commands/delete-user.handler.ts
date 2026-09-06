/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, AuditBehavior } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
  IQueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import { isTransientPersistenceError } from '@persistence/is-transient-persistence-error';
import { User } from '../../domain/models/user.entity';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from '../../persistence/repository.tokens';
import { GetUserQuery } from '../queries/get-user.query';
import { DeleteUserCommand } from './delete-user.command';

@CommandHandler(DeleteUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    {
      rules: [{ action: APP_ACTIONS.DELETE, subject: APP_SUBJECTS.USER }],
    },
  ],
  /**
   * Wrap the delete in a resilience policy for transient-fault handling.
   *
   * Effective composition (outermost → innermost):
   *   retry → circuitBreaker → handler
   *
   * - retry:          up to 3 attempts with decorrelated-jitter exponential
   *                   backoff — but only for transient errors (see `handle`).
   * - circuitBreaker: after 5 consecutive failures, fail fast for 10s to give a
   *                   struggling database time to recover.
   *
   * `handle` accepts only known transient persistence/network failures, so
   * deterministic HTTP/domain failures are not retried or counted by the
   * circuit breaker.
   *
   * Note: retry/circuit events are already logged by ResilienceBehavior through
   * the injected logger (nestjs-pino via LOGGING_BEHAVIOR_LOGGER). The
   * `telemetry` hooks are reserved for non-logging side-effects (e.g. metrics
   * counters or alerting) and are intentionally omitted here.
   */
  [
    ResilienceBehavior,
    {
      handle: isTransientPersistenceError,
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
  /**
   * Audit this sensitive action. AuditBehavior records who deleted which user,
   * the outcome (success OR failure), the duration, and a redacted snapshot of
   * the request — to the configured AuditSink (LogAuditSink by default; see
   * app.module.ts). The actor is resolved from the request-scoped session store
   * populated by SessionUserContextInterceptor.
   */
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
    @Inject(QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
    @Inject(COMMAND_REPOSITORY.deleteUser)
    private readonly commandRepository: ICommandRepository<User, null>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteUserCommand): Promise<User> {
    const { id } = command;

    const query = new GetUserQuery({ userId: id }, { hydrate: true });
    const user = User.from(await this.queryRepository.find(query));

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.authorizer.authorize('delete', user);

    user.delete();

    await this.commandRepository.save(user);

    return user;
  }
}
