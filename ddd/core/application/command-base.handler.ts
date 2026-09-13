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

/**
 * Base class for all CQRS command handlers.
 *
 * Wraps every concrete command handler with shared lifecycle behavior:
 * 1. Executes command logic via the abstract {@link handle} method.
 * 2. If the result is an {@link AggregateRoot} (or an object containing `aggregate: AggregateRoot`),
 *    its buffered uncommitted domain events are automatically published to the {@link EventBus}
 *    and cleared via {@link commit}.
 *
 * @typeParam TCommand - The concrete command type this handler processes.
 * @typeParam TResult - The handler's return type (e.g. aggregate entity or result carrying aggregate).
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
 * @example Returning an application result carrying an AggregateRoot (auto-published)
 * ```typescript
 * @CommandHandler(CreateAuthCommand)
 * export class CreateAuthHandler extends CommandBaseHandler<CreateAuthCommand, CreateAuthResult> {
 *   constructor(
 *     @Inject(COMMAND_REPOSITORY.createAuth)
 *     private readonly commandRepository: ICommandRepository<Auth, null>,
 *     protected readonly eventBus: EventBus,
 *   ) {
 *     super(eventBus);
 *   }
 *
 *   async handle(command: CreateAuthCommand): Promise<CreateAuthResult> {
 *     const auth = Auth.create(userId, token);
 *     await this.commandRepository.save(auth);
 *     return {
 *       aggregate: auth, // execute() automatically detects aggregate and publishes events
 *       id: userId,
 *       tenant: tenant,
 *       token,
 *     };
 *   }
 * }
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
   * **Delivery Guarantees**:
   * Events are dispatched via NestJS CQRS in-memory {@link EventBus}. There is no distributed
   * transaction or transactional outbox guarantee between repository persistence and event delivery.
   * In the event of an unhandled crash or process kill immediately following database commit but
   * prior to event handling, published events may be lost. For workflows requiring guaranteed
   * at-least-once delivery, an outbox table or message broker pattern should be used.
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
   * events if the result is an {@link AggregateRoot} (or an object containing `aggregate: AggregateRoot`).
   *
   * @param command - The command dispatched through the `CommandBus`.
   * @returns The result produced by {@link handle}.
   */
  async execute(command: ICommand): Promise<TResult> {
    const commandResult = await this.handle(command as TCommand);

    if (commandResult instanceof AggregateRoot) {
      this.commit(commandResult);
    } else if (
      commandResult &&
      typeof commandResult === 'object' &&
      'aggregate' in commandResult &&
      (commandResult as { aggregate: unknown }).aggregate instanceof
        AggregateRoot
    ) {
      this.commit((commandResult as { aggregate: AggregateRoot }).aggregate);
    }

    return commandResult;
  }
}
