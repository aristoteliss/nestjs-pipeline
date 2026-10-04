/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  APP_ACTIONS,
  APP_SUBJECTS,
  AUDIT_ACTIONS,
  RATE_LIMIT_COST,
} from '@common/constants/index.js';
import { sessionPrincipalKey } from '@common/context/session-principal.store.js';
import { operationIdempotencyKeyFactory } from '@common/idempotency/operation-key.js';
import { ICommandRepository } from '@cqrs-ddd/core/application';
import { logging, UsePipeline } from '@cqrs-ddd/pipeline';
import { AUDIT_SEVERITY, audit } from '@cqrs-ddd/pipeline-audit';
import {
  CaslAuthorizer,
  requireAbilityDigest,
  requires,
} from '@cqrs-ddd/pipeline-casl';
import { featureFlag } from '@cqrs-ddd/pipeline-feature-flags';
import { idempotent } from '@cqrs-ddd/pipeline-idempotency';
import {
  createPartitionedRateLimitKeyFactory,
  rateLimit,
} from '@cqrs-ddd/pipeline-rate-limit';
import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { UniqueEmailException } from '../../../domain/models/errors/email.exception.js';
import { User, type UserSnapshot } from '../../../domain/models/user.entity.js';
import { COMMAND_REPOSITORY } from '../../../persistence/repository.tokens.js';
import { CreateUserCommand } from './create-user.command.js';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  logging({
    mapLogLevel: new Map([[UniqueEmailException, 'warn']]),
  }),
  requires({ action: APP_ACTIONS.CREATE, subject: APP_SUBJECTS.USER }),
  featureFlag({ flag: 'user-registration' }),
  rateLimit({
    keyFactory: createPartitionedRateLimitKeyFactory(sessionPrincipalKey),
    points: RATE_LIMIT_COST.createUser,
  }),
  idempotent({
    keyFactory: operationIdempotencyKeyFactory(
      'user.create',
      (ctx) => (ctx.request as CreateUserCommand).idempotencyKey,
    ),
    replayScopeFactory: requireAbilityDigest,
  }),
  audit({
    action: AUDIT_ACTIONS.USER_CREATE,
    severity: AUDIT_SEVERITY.MEDIUM,
  }),
)
export class CreateUserHandler
  implements ICommandHandler<CreateUserCommand, User>
{
  constructor(
    @Inject(COMMAND_REPOSITORY.createUser)
    private readonly commandRepository: ICommandRepository<User, UserSnapshot>,
    private readonly authorizer: CaslAuthorizer,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const { username, email, department } = command;
    const user = User.create(username, email, department);
    this.authorizer.authorize('create', user, [
      'username',
      'email',
      ...(department !== undefined ? ['department'] : []),
    ]);
    await this.commandRepository.save(user);
    await this.publisher.mergeObjectContext(user).commit();
    return user;
  }
}
