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

import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
} from '@nestjs-pipeline/ddd-core';
import { Role } from '../../domain/models/role.entity';
import { RoleCreateOutcome } from '../../domain/outcomes/role-create.outcome';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { CreateRoleCommand } from './create-role.command';

@CommandHandler(CreateRoleCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    {
      subjectFromRequest: 'Role',
      rules: [
        { action: 'create', subject: 'Role' },
        { action: 'read', subject: 'User' },
      ],
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

    this.commandRepository.save(outcome);

    return outcome;
  }
}
