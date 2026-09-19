/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
/**
 * Result shapes that allow `CommandBaseHandler` to publish buffered aggregate events.
 * Return either the aggregate itself or an application result with an `aggregate` field.
 */
export type AggregateBearingResult =
  | AggregateRoot
  | { readonly aggregate: AggregateRoot };

export abstract class CommandBaseHandler<
  TCommand extends ICommand = ICommand,
  TResult extends AggregateBearingResult = AggregateBearingResult,
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

    const aggregate =
      commandResult instanceof AggregateRoot
        ? commandResult
        : commandResult &&
            typeof commandResult === 'object' &&
            'aggregate' in commandResult &&
            commandResult.aggregate instanceof AggregateRoot
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
