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

import { EventBus, type ICommand, type ICommandHandler } from '@nestjs/cqrs';
import { DomainOutcome } from '../domain/outcomes/domain.outcome';

export abstract class CommandBaseHandler<
  TCommand extends ICommand = ICommand,
  TResult = DomainOutcome,
> implements ICommandHandler<ICommand, TResult> {
  protected constructor(protected eventBus: EventBus) { }

  abstract handle(command: TCommand): Promise<TResult>;

  async execute(command: ICommand): Promise<TResult> {
    const commandResult = await this.handle(command as TCommand);

    if (commandResult instanceof DomainOutcome) {
      this.eventBus.publishAll(commandResult.events);
    }

    return commandResult;
  }
}
