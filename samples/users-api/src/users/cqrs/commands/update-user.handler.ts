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
import { Scope, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UpdateUserCommand } from './update-user.command';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { User } from '../../domain/user.entity';
import { IUserRepository, USER_REPOSITORY } from '../../repositories/user.repository.interface';

@CommandHandler(UpdateUserCommand, { scope: Scope.REQUEST })
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }]
)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(command: UpdateUserCommand): Promise<User> {
    const user = this.userRepository.findById(command.id);
    user.rename(command.username);
    this.userRepository.save(user);
    return user;
  }
}