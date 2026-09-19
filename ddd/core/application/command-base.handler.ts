/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { EventBus, type ICommand, type ICommandHandler } from '@nestjs/cqrs';
import { AggregateRoot } from '../domain/models/aggregate-root';

/**
 * Result shapes that allow `CommandBaseHandler` to publish buffered aggregate events.
 * Return either the aggregate itself or an application result with an `aggregate` field.
 */
export type AggregateBearingResult =
  | AggregateRoot
  | { readonly aggregate: AggregateRoot };

function isAggregate(obj: unknown): obj is AggregateRoot {
  return (
    obj instanceof AggregateRoot ||
    (typeof obj === 'object' &&
      obj !== null &&
      typeof (obj as AggregateRoot).getUncommittedEvents === 'function' &&
      typeof (obj as AggregateRoot).uncommit === 'function')
  );
}

/**
 * Base class for all CQRS command handlers.
 *
 * Wraps every concrete command handler with shared lifecycle behavior:
 * 1. Executes command logic via the abstract {@link handle} method.
 * 2. If the result is an {@link AggregateRoot} (or an object containing `aggregate: AggregateRoot`),
 *    its buffered uncommitted domain events are automatically published to the {@link EventBus}
 *    and cleared after publication.
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
  TResult extends AggregateBearingResult = AggregateBearingResult,
> implements ICommandHandler<ICommand, TResult>
{
  /**
   * Constructs the handler with an injected Nest CQRS {@link EventBus}.
   *
   * @param eventBus - The EventBus used to dispatch domain events.
   */
  protected constructor(protected readonly eventBus: EventBus) {}

  /**
   * Executes the business logic for the command.
   *
   * Concrete handlers must implement this method instead of `execute()`.
   * If the returned result is an {@link AggregateRoot} (or contains an `aggregate` property),
   * any uncommitted domain events recorded on it will be published automatically.
   *
   * @param command - The typed command to process.
   * @returns The result of the command execution.
   */
  abstract handle(command: TCommand): Promise<TResult>;

  /**
   * Nest `ICommandHandler` entry point invoked by the `CommandBus`.
   *
   * Delegates to {@link handle} and automatically publishes any uncommitted domain
   * events if the result is an {@link AggregateRoot} (or an object containing `aggregate: AggregateRoot`).
   *
   * Persistence and in-memory EventBus publication are not atomic. A crash after
   * persistence can lose events; durable delivery requires an explicit outbox.
   *
   * @param command - The command dispatched through the `CommandBus`.
   * @returns The result produced by {@link handle}.
   */
  async execute(command: ICommand): Promise<TResult> {
    const commandResult = await this.handle(command as TCommand);

    const aggregate = isAggregate(commandResult)
      ? commandResult
      : commandResult &&
          typeof commandResult === 'object' &&
          'aggregate' in commandResult &&
          isAggregate(commandResult.aggregate)
        ? commandResult.aggregate
        : undefined;

    if (aggregate) {
      const events = [...aggregate.getUncommittedEvents()];
      if (events.length > 0) {
        this.eventBus.publishAll(events);
        aggregate.uncommit();
      }
    }

    return commandResult;
  }
}
