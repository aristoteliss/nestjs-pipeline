/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import { requireTenantId } from '@common/cqrs/helpers/requireTenantId.helper';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CaslAuthorizer, CaslBehavior } from '@nestjs-pipeline/casl';
import {
  type IPipelineContext,
  LoggingBehavior,
  UsePipeline,
} from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
} from '@nestjs-pipeline/ddd-core/application';
import { FeatureFlagBehavior } from '@nestjs-pipeline/feature-flags';
import { IdempotencyBehavior } from '@nestjs-pipeline/idempotency';
import { RateLimitBehavior } from '@nestjs-pipeline/rate-limit';
import { UniqueEmailException } from '../../domain/models/errors/email.exception';
import { User, type UserSnapshot } from '../../domain/models/user.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { CreateUserCommand } from './create-user.command';

export function createUserIdempotencyKey(ctx: IPipelineContext): string {
  const request = ctx.request as CreateUserCommand;
  const tenantId = requireTenantId(ctx, 'user creation idempotency');
  const actorId =
    request.sessionUser?.id ?? getSessionUserFromStore()?.id ?? 'anonymous';
  return `${tenantId}:${actorId}:user.create:${request.email}`;
}

export function createUserRateLimitKey(ctx: IPipelineContext): string {
  const tenantId = requireTenantId(ctx, 'user creation rate limiting');
  return `${tenantId}:${(ctx.request as CreateUserCommand).email}`;
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
      rules: [{ action: APP_ACTIONS.CREATE, subject: APP_SUBJECTS.USER }],
    },
  ],
  [FeatureFlagBehavior, { flag: 'user-registration' }],
  [RateLimitBehavior, { keyFactory: createUserRateLimitKey }],
  [IdempotencyBehavior, { keyFactory: createUserIdempotencyKey }],
)
export class CreateUserHandler extends CommandBaseHandler<
  CreateUserCommand,
  User
> {
  constructor(
    @Inject(COMMAND_REPOSITORY.createUser)
    private readonly commandRepository: ICommandRepository<User, UserSnapshot>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CreateUserCommand): Promise<User> {
    const { username, email, department } = command;
    const user = User.create(username, email, department);
    this.authorizer.authorize('create', user, [
      'username',
      'email',
      ...(department !== undefined ? ['department'] : []),
    ]);
    await this.commandRepository.save(user);
    return user;
  }
}
