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
import { Inject, Scope } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { CaslBehavior } from '@nestjs-pipeline/casl';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
  IQueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { User } from '../../domain/models/user.entity';
import { UserUpdateOutcome } from '../../domain/outcomes/user-update.outcome';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from '../../repositories/repository.tokens';
import { GetUserQuery } from '../queries/get-user.query';
import { UpdateUserCommand } from './update-user.command';

@CommandHandler(UpdateUserCommand, { scope: Scope.REQUEST })
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [
    CaslBehavior,
    {
      subjectFromRequest: 'User',
      rules: [{ action: 'update', subject: 'User' }],
    },
  ],
)
export class UpdateUserHandler extends CommandBaseHandler<
  UpdateUserCommand,
  UserUpdateOutcome
> {
  constructor(
    @Inject(QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
    @Inject(COMMAND_REPOSITORY.updateUser)
    private readonly commandRepository: ICommandRepository<UserUpdateOutcome>,
    protected readonly eventBus: EventBus,
  ) {
    super(eventBus);
  }

  async handle(command: UpdateUserCommand): Promise<UserUpdateOutcome> {
    const { id, username, department } = command;

    const query = new GetUserQuery({ userId: id });

    const user = await this.queryRepository.find(query);

    if (!username && !department) {
      throw new Error('No update fields provided');
    }

    const outcome = username
      ? user.rename(username)
      : user.changeDepartment(department!);

    this.commandRepository.save(outcome);

    return outcome;
  }
}
