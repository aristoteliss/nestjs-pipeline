/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { APP_ACTIONS, APP_SUBJECTS } from '@common/constants';
import {
  operationIdempotencyKeyFactory,
  replayScopeDigest,
} from '@common/cqrs/helpers/idempotent-operation.helper';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CaslAuthorizer, requires } from '@nestjs-pipeline/casl';
import {
  type IPipelineContext,
  logging,
  UsePipeline,
} from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
} from '@nestjs-pipeline/ddd-core/application';
import { featureFlag } from '@nestjs-pipeline/feature-flags';
import { idempotent } from '@nestjs-pipeline/idempotency';
import { UniqueRoleNameException } from '../../domain/models/errors/role-name.exception';
import { Role, type RoleSnapshot } from '../../domain/models/role.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { CreateRoleCommand } from './create-role.command';

const ROLE_CREATE_PURPOSE = 'role creation idempotency';

export const createRoleIdempotencyKey = operationIdempotencyKeyFactory(
  'role.create',
  (ctx) => (ctx.request as CreateRoleCommand).name,
);

export function createRoleReplayScope(ctx: IPipelineContext): string {
  return replayScopeDigest(ctx, ROLE_CREATE_PURPOSE);
}

@CommandHandler(CreateRoleCommand)
@UsePipeline(
  logging({
    requestResponseLogLevel: 'log',
    mapLogLevel: new Map([[UniqueRoleNameException, 'warn']]),
  }),
  requires(
    { action: APP_ACTIONS.CREATE, subject: APP_SUBJECTS.ROLE },
    { action: APP_ACTIONS.READ, subject: APP_SUBJECTS.USER },
  ),
  featureFlag({ flag: 'role-creation' }),
  idempotent({
    keyFactory: createRoleIdempotencyKey,
    replayScopeFactory: createRoleReplayScope,
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
