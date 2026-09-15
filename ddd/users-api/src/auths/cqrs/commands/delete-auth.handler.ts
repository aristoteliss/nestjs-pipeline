/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type {
  ICommandRepository,
  IQueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { Auth } from '../../domain/models/auth.entity';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from '../../persistence/repository.tokens';
import { FindAuthQuery } from '../queries/find-auth.query';
import { DeleteAuthCommand } from './delete-auth.command';

/**
 * Command handler that revokes an active authenticated session on logout.
 *
 * Looks up the actual persistent `Auth` aggregate via `QUERY_REPOSITORY.findAuth`
 * using the caller's user ID and token, then passes the aggregate to
 * `COMMAND_REPOSITORY.deleteAuth` for primary-key deletion and cache eviction.
 */
@CommandHandler(DeleteAuthCommand)
export class DeleteAuthHandler
  implements ICommandHandler<DeleteAuthCommand, void>
{
  constructor(
    @Inject(COMMAND_REPOSITORY.deleteAuth)
    private readonly commandRepository: ICommandRepository<Auth, null>,
    @Inject(QUERY_REPOSITORY.findAuth)
    private readonly queryRepository: IQueryRepository<
      FindAuthQuery,
      Auth | null
    >,
  ) {}

  async execute(command: DeleteAuthCommand): Promise<void> {
    const auth = await this.queryRepository.find(
      new FindAuthQuery({ userId: command.userId, token: command.token }),
    );

    if (auth) {
      await this.commandRepository.save(auth);
    }
  }
}
