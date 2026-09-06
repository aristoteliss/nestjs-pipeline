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
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { ICommandRepository } from '@nestjs-pipeline/ddd-core';
import { Auth } from '../../domain/models/auth.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { DeleteAuthCommand } from './delete-auth.command';

@CommandHandler(DeleteAuthCommand)
export class DeleteAuthHandler
  implements ICommandHandler<DeleteAuthCommand, void>
{
  constructor(
    @Inject(COMMAND_REPOSITORY.deleteAuth)
    private readonly commandRepository: ICommandRepository<Auth, null>,
  ) {}

  async execute(command: DeleteAuthCommand): Promise<void> {
    const userId = command.sessionUser?.id;
    if (userId) {
      await this.commandRepository.save(new Auth({ userId, token: '' }));
    }
  }
}
