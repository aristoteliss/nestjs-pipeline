/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS, AUDIT_ACTIONS } from '@common/constants';
import { operationIdempotencyKeyFactory } from '@common/idempotency/operation-key';
import {
  CommandBaseHandler,
  ICommandRepository,
} from '@cqrs-ddd/core/application';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, audit } from '@nestjs-pipeline/audit';
import {
  CaslAuthorizer,
  requireAbilityDigest,
  requires,
} from '@nestjs-pipeline/casl';
import { logging, UsePipeline } from '@nestjs-pipeline/core';
import { featureFlag } from '@nestjs-pipeline/feature-flags';
import { idempotent } from '@nestjs-pipeline/idempotency';
import { UniqueRoleNameException } from '../../../domain/models/errors/role-name.exception';
import { Role, type RoleSnapshot } from '../../../domain/models/role.entity';
import { COMMAND_REPOSITORY } from '../../../persistence/repository.tokens';
import { CreateRoleCommand } from './create-role.command';

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
export class CreateRoleHandler extends CommandBaseHandler<
  CreateRoleCommand,
  Role
> {
  constructor(
    @Inject(COMMAND_REPOSITORY.createRole)
    private readonly commandRepository: ICommandRepository<Role, RoleSnapshot>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CreateRoleCommand): Promise<Role> {
    const role = Role.create(command.name);
    this.authorizer.authorize('create', role, ['name']);
    await this.commandRepository.save(role);
    return role;
  }
}
