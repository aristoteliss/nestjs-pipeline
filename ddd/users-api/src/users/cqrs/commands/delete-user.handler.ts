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

import { getSessionUserFromStore } from '@common/context/session-user.store';
import { Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AuditBehavior } from '@nestjs-pipeline/audit';
import { CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
  IQueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { ResilienceBehavior } from '@nestjs-pipeline/resilience';
import { isTransientPersistenceError } from '@persistence/is-transient-persistence-error';
import { User } from '../../domain/models/user.entity';
import { UserUpdateOutcome } from '../../domain/outcomes/user-update.outcome';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from '../../repositories/repository.tokens';
import { GetUserQuery } from '../queries/get-user.query';
import { assertUserPermission } from '../queries/user-read-authorization.helper';
import { DeleteUserCommand } from './delete-user.command';

@CommandHandler(DeleteUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    {
      rules: [{ action: 'delete', subject: 'User' }],
    },
  ],
  /**
   * Wrap the delete in a resilience policy for transient-fault handling.
   *
   * Effective composition (outermost → innermost):
   *   retry → circuitBreaker → timeout → handler
   *
   * - timeout:        abort the DB read/write if it hangs past 3s.
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
      timeout: { duration: 3_000 },
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
   * populated by AuthSessionInterceptor.
   */
  [
    AuditBehavior,
    {
      action: 'user.delete',
      severity: 'high',
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
  UserUpdateOutcome
> {
  constructor(
    @Inject(QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
    @Inject(COMMAND_REPOSITORY.deleteUser)
    private readonly commandRepository: ICommandRepository<UserUpdateOutcome>,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteUserCommand): Promise<UserUpdateOutcome> {
    const { id } = command;

    const query = new GetUserQuery({ userId: id }, { hydrate: true });

    const user = await this.queryRepository.find(query);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    assertUserPermission(user, 'delete');

    const outcome = user.delete();

    await this.commandRepository.save(outcome);

    return outcome;
  }
}
