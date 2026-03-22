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
import { UserUpdateOutcome } from '../../domain/outcomes/user-update.outcome';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../repositories/user.repository.interface';
import { DeleteUserCommand } from './delete-user.command';

@CommandHandler(DeleteUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class DeleteUserHandler extends CommandBaseHandler<
  DeleteUserCommand,
  UserUpdateOutcome
> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteUserCommand): Promise<UserUpdateOutcome> {
    const { id } = command;

    const user = this.userRepository.findById(id);

    const outcome = user.delete();

    this.userRepository.delete(command.id);

    return outcome;
  }
}
