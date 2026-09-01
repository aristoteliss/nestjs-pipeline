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

import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CaslBehavior } from '@nestjs-pipeline/casl';
import {
  type IPipelineContext,
  LoggingBehavior,
  UsePipeline,
} from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
} from '@nestjs-pipeline/ddd-core';
import { FeatureFlagBehavior } from '@nestjs-pipeline/feature-flags';
import { IdempotencyBehavior } from '@nestjs-pipeline/idempotency';
import { RateLimitBehavior } from '@nestjs-pipeline/rate-limit';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { UniqueEmailException } from '../../domain/models/errors/email.exception';
import { User } from '../../domain/models/user.entity';
import { UserCreateOutcome } from '../../domain/outcomes/user-create.outcome';
import { COMMAND_REPOSITORY } from '../../repositories/repository.tokens';
import { CreateUserCommand } from './create-user.command';

export function createUserIdempotencyKey(ctx: IPipelineContext): string {
  const request = ctx.request as CreateUserCommand;
  return `${TenantSchemaContext.currentSchema}:${request.sessionUser?.id ?? 'anonymous'}:user.create:${request.email}`;
}

@CommandHandler(CreateUserCommand)
@UsePipeline(
  [
    LoggingBehavior,
    {
      requestResponseLogLevel: 'log',
      mapLogLevel: new Map([[UniqueEmailException, 'warn']]),
    },
  ],
  [
    CaslBehavior,
    {
      rules: [{ action: 'create', subject: 'User' }],
    },
  ],
  // Gate user registration behind the 'user-registration' feature flag. When
  // disabled, this handler never runs and FeatureDisabledError is thrown.
  [FeatureFlagBehavior, { flag: 'user-registration' }],
  // Throttle registrations per email to 5 / 60s (module default limiter). A 6th
  // attempt throws RateLimitExceededError → HTTP 429 (see RateLimitExceededFilter).
  [
    RateLimitBehavior,
    {
      keyFactory: (ctx: IPipelineContext) =>
        `${TenantSchemaContext.currentSchema}:${(ctx.request as CreateUserCommand).email}`,
    },
  ],
  // Make registration idempotent per tenant, principal, and email: a retried POST
  // with the same email replays the first response instead of creating a second
  // user. Reusing the email with a DIFFERENT payload yields HTTP 422; a
  // still-in-flight duplicate yields HTTP 409 (see IdempotencyConflictFilter).
  [
    IdempotencyBehavior,
    {
      keyFactory: createUserIdempotencyKey,
    },
  ],
)
export class CreateUserHandler extends CommandBaseHandler<
  CreateUserCommand,
  UserCreateOutcome
> {
  constructor(
    @Inject(COMMAND_REPOSITORY.createUser)
    private readonly commandRepository: ICommandRepository<UserCreateOutcome>,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CreateUserCommand): Promise<UserCreateOutcome> {
    const { username, email, department } = command;

    const outcome = User.create(username, email, department);
    outcome.entity.authorize('create', [
      'username',
      'email',
      ...(department !== undefined ? ['department'] : []),
    ]);

    try {
      await this.commandRepository.save(outcome);
    } catch (err: unknown) {
      if (
        err instanceof UniqueConstraintViolationException ||
        (typeof err === 'object' &&
          err !== null &&
          'code' in err &&
          err.code === 'SQLITE_CONSTRAINT_UNIQUE')
      ) {
        throw new UniqueEmailException(outcome.entity);
      }
      throw err;
    }

    return outcome;
  }
}
