/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  APP_ACTIONS,
  APP_SUBJECTS,
  AUDIT_ACTIONS,
} from '@common/constants/index.js';
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
import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { UniqueRoleNameException } from '../../../domain/models/errors/role-name.exception.js';
import { Role, type RoleSnapshot } from '../../../domain/models/role.entity.js';
import { COMMAND_REPOSITORY } from '../../../persistence/repository.tokens.js';
import { CreateRoleCommand } from './create-role.command.js';

@CommandHandler(CreateRoleCommand)
@UsePipeline(
  logging({
    mapLogLevel: new Map([[UniqueRoleNameException, 'warn']]),
  }),
  requires(
    { action: APP_ACTIONS.CREATE, subject: APP_SUBJECTS.ROLE },
    { action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER },
  ),
  featureFlag({ flag: 'role-creation' }),
  idempotent({
    keyFactory: operationIdempotencyKeyFactory(
      'role.create',
      (ctx) => (ctx.request as CreateRoleCommand).idempotencyKey,
    ),
    replayScopeFactory: requireAbilityDigest,
  }),
  audit({
    action: AUDIT_ACTIONS.ROLE_CREATE,
    severity: AUDIT_SEVERITY.MEDIUM,
  }),
)
export class CreateRoleHandler
  implements ICommandHandler<CreateRoleCommand, Role>
{
  constructor(
    @Inject(COMMAND_REPOSITORY.createRole)
    private readonly commandRepository: ICommandRepository<Role, RoleSnapshot>,
    private readonly authorizer: CaslAuthorizer,
    private readonly publisher: EventPublisher,
  ) {}

  async execute(command: CreateRoleCommand): Promise<Role> {
    const role = Role.create(command.name);
    this.authorizer.authorize('create', role, ['name']);
    await this.commandRepository.save(role);
    await this.publisher.mergeObjectContext(role).commit();
    return role;
  }
}
