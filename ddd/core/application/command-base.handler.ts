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

/**
 * Base class for all command handlers.
 *
 * Wraps every concrete command handler with a single, shared behavior: after the
 * command is handled, any {@link DomainOutcome} it returns has its domain events
 * published to the {@link EventBus} automatically. Subclasses therefore never
 * have to publish events themselves — they only produce an outcome.
 *
 * This is achieved by implementing {@link execute} (the Nest `ICommandHandler`
 * entry point) here and exposing {@link handle} as an `abstract` method for
 * subclasses to provide the actual command logic.
 *
 * @typeParam TCommand - The concrete command type this handler processes.
 * @typeParam TResult - The handler's return type (defaults to {@link DomainOutcome}).
 */
export abstract class CommandBaseHandler<
  TCommand extends ICommand = ICommand,
  TResult = DomainOutcome,
> implements ICommandHandler<ICommand, TResult> {
  protected constructor(protected eventBus: EventBus) { }

  /**
   * Handles the command and produces a result.
   *
   * Implemented by each concrete handler with the command-specific logic. Return
   * a {@link DomainOutcome} (or subclass) to have its domain events published
   * automatically by {@link execute}.
   *
   * @param command - The command to process.
   * @returns The handler result.
   */
  abstract handle(command: TCommand): Promise<TResult>;

  /**
   * Nest `ICommandHandler` entry point invoked by the `CommandBus`.
   *
   * Delegates to {@link handle} and, when the result is a {@link DomainOutcome},
   * publishes its collected domain events via the {@link EventBus} before
   * returning. Subclasses should not override this method.
   *
   * @param command - The command dispatched through the `CommandBus`.
   * @returns The result produced by {@link handle}.
   */
  async execute(command: ICommand): Promise<TResult> {
    const commandResult = await this.handle(command as TCommand);

    if (commandResult instanceof DomainOutcome) {
      this.eventBus.publishAll(commandResult.events);
    }

    return commandResult;
  }
}
