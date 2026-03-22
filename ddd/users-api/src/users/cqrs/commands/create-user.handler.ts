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
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { CommandBaseHandler } from '@nestjs-pipeline/ddd-core';
import { User } from '../../domain/models/user.entity';
import { UserCreateOutcome } from '../../domain/outcomes/user-create.outcome';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../repositories/user.repository.interface';
import { CreateUserCommand } from './create-user.command';

@CommandHandler(CreateUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateUserHandler extends CommandBaseHandler<
  CreateUserCommand,
  UserCreateOutcome
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: CreateUserCommand): Promise<UserCreateOutcome> {
    const outcome = User.create(command.username, command.email);

    this.userRepository.save(outcome.entity);

    return outcome;
  }
}
