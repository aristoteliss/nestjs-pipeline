/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Type } from '@nestjs/common';

/**
 * Rich context available to every pipeline behavior during execution.
 *
 * Behaviors should type-hint against this **interface** to stay decoupled.
 * The concrete implementation ({@link BasePipelineContext}) provides shared
 * logic; extend it only when you need a custom context variant.
 */
export interface IPipelineContext<TRequest = unknown, TResponse = unknown> {
  /**
   * Immutable correlation ID for distributed tracing: the execution scope's
   * correlation id when the pipeline starts (`runInScope`, which nested
   * dispatches inherit), otherwise a generated `uuidv7()`.
   */
  readonly correlationId: string;

  /**
   * Tenant of this execution: the execution scope's tenant when the pipeline
   * starts, which nested dispatches inherit. Absent when the scope has none;
   * tenant-scoped behaviors then fail closed.
   */
  readonly tenantId?: string;

  /** The command/query/event instance with all its property values. */
  readonly request: TRequest;

  /** The class (constructor) of the command/query/event. */
  readonly requestType: Type<TRequest>;

  /** The class name string, e.g. "CreateUserCommand". */
  readonly requestName: string;

  /** The handler class (constructor) that will process this request. */
  readonly handlerType: Type;

  /** The handler class name string, e.g. "CreateUserHandler". */
  readonly handlerName: string;

  /** 'command', 'query', or 'event' — detected at bootstrap from NestJS metadata. */
  readonly requestKind: 'command' | 'query' | 'event' | 'unknown';

  /** UTC timestamp when the pipeline execution started. */
  readonly startedAt: Date;

  /**
   * The handler's return value, set automatically after the real handler executes.
   * Available to behaviors in their post-`next()` code path.
   * `undefined` before the handler runs or for event handlers that return void.
   */
  readonly response: TResponse | undefined;

  /**
   * Bag for sharing arbitrary data between behaviors in the same execution.
   * Use createPipelineItem and the typed item accessors for compile-time value checks.
   * Raw map access remains supported and bypasses those checks.
   *
   * Keys can be strings or exported `unique symbol` constants. Exported symbols
   * are strongly recommended to prevent collision between behaviors or third-party packages.
   *
   * @example
   * ```ts
   * export const MY_ITEM = Symbol('MY_ITEM');
   * context.items.set(MY_ITEM, customData);
   * const val = context.items.get(MY_ITEM);
   * ```
   */
  readonly items: Map<string | symbol, unknown>;

  /**
   * Returns the options for a behavior on this handler: the options from a
   * global `[Behavior, opts]` tuple, shallowly overridden by the options from
   * the handler's `@UsePipeline([Behavior, opts])`. Returns undefined when
   * neither supplies options for that behavior.
   */
  getBehaviorOptions<T = Record<string, unknown>>(
    behaviorType: Type,
  ): T | undefined;
}
