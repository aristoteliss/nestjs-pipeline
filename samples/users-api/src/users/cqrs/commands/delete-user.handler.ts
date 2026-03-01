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
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DeleteUserCommand } from './delete-user.command';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { IUserRepository, USER_REPOSITORY } from '../../repositories/user.repository.interface';

@CommandHandler(DeleteUserCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class DeleteUserHandler implements ICommandHandler<DeleteUserCommand, void> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(command: DeleteUserCommand): Promise<void> {
    this.userRepository.delete(command.id);
  }
}
