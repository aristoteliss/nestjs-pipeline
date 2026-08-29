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
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { UniqueRoleNameException } from '../../domain/models/errors/role-name.exception';
import { Role } from '../../domain/models/role.entity';
import { RoleCreateOutcome } from '../../domain/outcomes/role-create.outcome';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { assertRolePermission } from '../role-authorization.helper';
import { CreateRoleCommand } from './create-role.command';

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
        { action: 'create', subject: 'Role' },
        { action: 'read', subject: 'User' },
      ],
    },
  ],
  // Gate role creation behind the 'role-creation' feature flag
  [FeatureFlagBehavior, { flag: 'role-creation' }],
  // Ensure idempotent role creation requests per role name
  [
    IdempotencyBehavior,
    {
      keyFactory: (ctx: IPipelineContext) =>
        `${TenantSchemaContext.currentSchema}:role.create:${(ctx.request as CreateRoleCommand).name}`,
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
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CreateRoleCommand): Promise<RoleCreateOutcome> {
    const { name } = command;

    const outcome = Role.create(name);
    assertRolePermission(outcome.entity, 'create', ['name']);

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
        throw new UniqueRoleNameException(outcome.entity);
      }
      throw err;
    }

    return outcome;
  }
}
