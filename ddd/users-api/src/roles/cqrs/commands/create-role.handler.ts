/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

import { requireTenantId } from '@common/cqrs/helpers/requireTenantId.helper';
import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import { getSessionUserFromStore } from '@common/context/session-user.store';
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
} from '@nestjs-pipeline/ddd-core';
import { FeatureFlagBehavior } from '@nestjs-pipeline/feature-flags';
import { IdempotencyBehavior } from '@nestjs-pipeline/idempotency';
import { UniqueRoleNameException } from '../../domain/models/errors/role-name.exception';
import { Role, type RoleSnapshot } from '../../domain/models/role.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { CreateRoleCommand } from './create-role.command';

/** Builds a tenant/principal/name-scoped idempotency key and fails closed without tenant context. */
export function createRoleIdempotencyKey(ctx: IPipelineContext): string {
  const request = ctx.request as CreateRoleCommand;
  const tenantId = requireTenantId(ctx, 'role creation idempotency');
  const actorId =
    request.sessionUser?.id ?? getSessionUserFromStore()?.id ?? 'anonymous';
  return `${tenantId}:${actorId}:role.create:${request.name}`;
}

@CommandHandler(CreateRoleCommand)
@UsePipeline(
  [
    LoggingBehavior,
    {
      requestResponseLogLevel: 'log',
      mapLogLevel: new Map([[UniqueRoleNameException, 'warn']]),
    },
  ],
  [
    CaslBehavior,
    {
      rules: [
        { action: APP_ACTIONS.CREATE, subject: APP_SUBJECTS.ROLE },
        { action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER },
      ],
    },
  ],
  [FeatureFlagBehavior, { flag: 'role-creation' }],
  [IdempotencyBehavior, { keyFactory: createRoleIdempotencyKey }],
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
