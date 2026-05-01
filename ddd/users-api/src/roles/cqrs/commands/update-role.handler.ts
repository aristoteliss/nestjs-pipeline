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

import { Inject, Scope } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
  IQueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { Role } from '../../domain/models/role.entity';
import { RoleUpdateOutcome } from '../../domain/outcomes/role-update.outcome';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from '../../persistence/repository.tokens';
import { GetRoleQuery } from '../queries/get-role.query';
import { UpdateRoleCommand } from './update-role.command';

@CommandHandler(UpdateRoleCommand, { scope: Scope.REQUEST })
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class UpdateRoleHandler extends CommandBaseHandler<
  UpdateRoleCommand,
  RoleUpdateOutcome
> {
  constructor(
    @Inject(QUERY_REPOSITORY.getRole)
    private readonly queryRepository: IQueryRepository<GetRoleQuery, Role>,
    @Inject(COMMAND_REPOSITORY.updateRole)
    private readonly commandRepository: ICommandRepository<RoleUpdateOutcome>,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: UpdateRoleCommand): Promise<RoleUpdateOutcome> {
    const { id, name } = command;

    const query = new GetRoleQuery({ roleId: id });

    const role = await this.queryRepository.find(query);

    const outcome = role.rename(name);

    await this.commandRepository.save(outcome);

    return outcome;
  }
}
