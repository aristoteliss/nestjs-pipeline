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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
 */

import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
} from '@nestjs-pipeline/ddd-core';
import { User } from '../../domain/models/user.entity';
import { UserCreateOutcome } from '../../domain/outcomes/user-create.outcome';
import { COMMAND_REPOSITORY } from '../../repositories/repository.tokens';
import { CreateUserCommand } from './create-user.command';

@CommandHandler(CreateUserCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    {
      subjectFromRequest: 'User',
      rules: [{ action: 'read', subject: 'User' }],
    },
  ],
)
export class CreateUserHandler extends CommandBaseHandler<
  CreateUserCommand,
  UserCreateOutcome
> {
  constructor(
    @Inject(COMMAND_REPOSITORY.createUser)
    private readonly commandRepository: ICommandRepository<UserCreateOutcome>,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CreateUserCommand): Promise<UserCreateOutcome> {
    const { username, email, tenantId, department } = command;

    const outcome = User.create(username, email, tenantId, department);

    await this.commandRepository.save(outcome);

    return outcome;
  }
}
