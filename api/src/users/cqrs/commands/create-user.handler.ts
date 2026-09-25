/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  APP_ACTIONS,
  APP_SUBJECTS,
  AUDIT_ACTIONS,
  RATE_LIMIT_COST,
} from '@common/constants';
import {
  operationIdempotencyKeyFactory,
  replayScopeDigest,
  requireTrustedPrincipal,
} from '@common/cqrs/helpers/idempotent-operation.helper';
import {
  CommandBaseHandler,
  ICommandRepository,
} from '@cqrs-ddd/core/application';
import { joinKeySegments } from '@cqrs-ddd/safe-stringify';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, audit } from '@nestjs-pipeline/audit';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import {
  type IPipelineContext,
  logging,
  UsePipeline,
} from '@nestjs-pipeline/core';
import { featureFlag } from '@nestjs-pipeline/feature-flags';
import { idempotent } from '@nestjs-pipeline/idempotency';
import {
  createPartitionedRateLimitKeyFactory,
  rateLimit,
} from '@nestjs-pipeline/rate-limit';
import { UniqueEmailException } from '../../domain/models/errors/email.exception';
import { User, type UserSnapshot } from '../../domain/models/user.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { CreateUserCommand } from './create-user.command';

const USER_CREATE_PURPOSE = 'user creation idempotency';

export const createUserIdempotencyKey = operationIdempotencyKeyFactory(
  'user.create',
  (ctx) => (ctx.request as CreateUserCommand).idempotencyKey,
);

export function createUserReplayScope(ctx: IPipelineContext): string {
  return replayScopeDigest(ctx, USER_CREATE_PURPOSE);
}

/** Creation quota per acting principal within its tenant. */
export const createUserRateLimitKey = createPartitionedRateLimitKeyFactory(
  (ctx) => {
    const { principalType, id } = requireTrustedPrincipal(ctx, 'user creation');
    return joinKeySegments([principalType, id]);
  },
);

@CommandHandler(CreateUserCommand)
@UsePipeline(
  logging({
    mapLogLevel: new Map([[UniqueEmailException, 'warn']]),
  }),
  requires({ action: APP_ACTIONS.CREATE, subject: APP_SUBJECTS.USER }),
  featureFlag({ flag: 'user-registration' }),
  rateLimit({
    keyFactory: createUserRateLimitKey,
    points: RATE_LIMIT_COST.createUser,
  }),
  idempotent({
    keyFactory: createUserIdempotencyKey,
    replayScopeFactory: createUserReplayScope,
  }),
  audit({
    action: AUDIT_ACTIONS.USER_CREATE,
    severity: AUDIT_SEVERITY.MEDIUM,
  }),
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
