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

import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { DeleteAuthCommand } from './delete-auth.command';

@CommandHandler(DeleteAuthCommand)
export class DeleteAuthHandler
  implements ICommandHandler<DeleteAuthCommand, void>
{
  async execute(_command: DeleteAuthCommand): Promise<void> {
    // Session clearing is performed by the controller after this command resolves.
    // Add audit logging or logout-triggered side effects here if needed.
  }
}
