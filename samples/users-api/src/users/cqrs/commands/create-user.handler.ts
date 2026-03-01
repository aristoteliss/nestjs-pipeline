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
import { CommandHandler, EventBus, ICommandHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { CreateUserCommand } from './create-user.command';
import { UserCreatedEvent } from '../events/user-created.event';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import { User } from '../../domain/user.entity';
import { IUserRepository, USER_REPOSITORY } from '../../repositories/user.repository.interface';

@CommandHandler(CreateUserCommand)
@UsePipeline([
  LoggingBehavior,
  { requestResponseLogLevel: 'log' },
])
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, User> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<User> {
    const user = User.create(command.username, command.email);
    this.userRepository.save(user);

    this.eventBus.publish(new UserCreatedEvent({ 
      userId: user.id, 
      username: user.username, 
      email: user.email 
    }));

    return user;
  }
}