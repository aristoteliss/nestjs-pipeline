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

import {
  AggregateRoot,
  EventBus,
  type ICommand,
  type ICommandHandler,
} from '@nestjs/cqrs';
import { DomainOutcome } from '../domain/outcomes/domain.outcome';

/**
 * Base class for all CQRS command handlers.
 *
 * Wraps every concrete command handler with shared lifecycle behavior:
 * 1. Executes command logic via the abstract {@link handle} method.
 * 2. If the result is an {@link AggregateRoot}, its buffered uncommitted domain events
 *    are automatically published to the {@link EventBus} and cleared via {@link commit}.
 * 3. Supports manual event publication via {@link commit} for handlers returning custom DTOs.
 * 4. Retains legacy support for {@link DomainOutcome}.
 *
 * @typeParam TCommand - The concrete command type this handler processes.
 * @typeParam TResult - The handler's return type (e.g. aggregate entity or DTO).
 *
 * @example Returning aggregate root directly (auto-published)
 * ```typescript
 * @CommandHandler(CreateUserCommand)
 * export class CreateUserHandler extends CommandBaseHandler<CreateUserCommand, User> {
 *   constructor(
 *     @Inject(COMMAND_REPOSITORY.createUser)
 *     private readonly commandRepository: ICommandRepository<User, UserSnapshot>,
 *     protected readonly eventBus: EventBus,
 *   ) {
 *     super(eventBus);
 *   }
 *
 *   async handle(command: CreateUserCommand): Promise<User> {
 *     const user = User.create(command.username, command.email);
 *     await this.commandRepository.save(user);
 *     return user; // execute() automatically publishes user.getUncommittedEvents()
 *   }
 * }
 * ```
 *
 * @example Returning a custom DTO using manual commit()
 * ```typescript
 *   async handle(command: CreateAuthCommand): Promise<SessionUser> {
 *     const auth = Auth.create(userId, token);
 *     await this.commandRepository.save(auth);
 *     this.commit(auth); // explicit publish and uncommit
 *     return { id: userId, token };
 *   }
 * ```
 */
export abstract class CommandBaseHandler<
  TCommand extends ICommand = ICommand,
  TResult = unknown,
> implements ICommandHandler<ICommand, TResult>
{
  protected constructor(protected readonly eventBus: EventBus) {}

  /**
   * Handles the command and produces a result.
   *
   * Implemented by each concrete handler with the command-specific logic.
   *
   * @param command - The command to process.
   * @returns The handler result.
   */
  abstract handle(command: TCommand): Promise<TResult>;

  /**
   * Publishes uncommitted domain events of the aggregate to the EventBus and clears them.
   *
   * @param aggregate - The aggregate root whose uncommitted events should be dispatched.
   */
  protected commit(aggregate: AggregateRoot): void {
    const events = [...aggregate.getUncommittedEvents()];
    if (events.length > 0) {
      this.eventBus.publishAll(events);
      aggregate.uncommit();
    }
  }

  /**
   * Nest `ICommandHandler` entry point invoked by the `CommandBus`.
   *
   * Delegates to {@link handle} and automatically publishes any uncommitted domain
   * events if the result is an {@link AggregateRoot} (or legacy {@link DomainOutcome}).
   *
   * @param command - The command dispatched through the `CommandBus`.
   * @returns The result produced by {@link handle}.
   */
  async execute(command: ICommand): Promise<TResult> {
    const commandResult = await this.handle(command as TCommand);

    if (commandResult instanceof AggregateRoot) {
      this.commit(commandResult);
    } else if (commandResult instanceof DomainOutcome) {
      this.eventBus.publishAll(commandResult.events);
    }

    return commandResult;
  }
}
