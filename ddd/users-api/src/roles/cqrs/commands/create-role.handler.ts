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
import { Role } from '../../domain/models/role.entity';
import { RoleCreateOutcome } from '../../domain/outcomes/role-create.outcome';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { CreateRoleCommand } from './create-role.command';

export function createRoleIdempotencyKey(ctx: IPipelineContext): string {
  const request = ctx.request as CreateRoleCommand;
  const tenantId = ctx.tenantId ?? 'default';
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
  [
    IdempotencyBehavior,
    {
      keyFactory: createRoleIdempotencyKey,
    },
  ],
)
export class CreateRoleHandler extends CommandBaseHandler<
  CreateRoleCommand,
  RoleCreateOutcome
> {
  constructor(
    @Inject(COMMAND_REPOSITORY.createRole)
    private readonly commandRepository: ICommandRepository<RoleCreateOutcome>,
    private readonly authorizer: CaslAuthorizer,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CreateRoleCommand): Promise<RoleCreateOutcome> {
    const { name } = command;

    const outcome = Role.create(name);
    this.authorizer.authorize('create', outcome.entity, ['name']);

    await this.commandRepository.save(outcome);

    return outcome;
  }
}
