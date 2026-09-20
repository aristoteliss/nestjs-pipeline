/* Copyright (C) 2026-present Aristotelis — see repository license. */

import 'reflect-metadata';
import { Type } from '@nestjs/common';
import { normalizeBehaviorEntries } from '../helpers/behavior-entries';
import { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';

export {
  type BehaviorId,
  getBehaviorId,
  PIPELINE_BEHAVIOR_ID,
} from '../helpers/behavior-id';

export const PIPELINE_BEHAVIORS_METADATA = Symbol('PIPELINE_BEHAVIORS');
export const PIPELINE_BEHAVIORS_OPTIONS_METADATA = Symbol(
  'PIPELINE_BEHAVIORS_OPTIONS',
);
export const PIPELINE_SKIPPED_BEHAVIORS_METADATA = Symbol(
  'PIPELINE_SKIPPED_BEHAVIORS',
);

/**
 * A tuple of a pipeline behavior class and its options.
 */
export type PipelineBehaviorTuple<
  TBehavior extends IPipelineBehavior = IPipelineBehavior,
  TOptions extends object = object,
> = [Type<TBehavior>, TOptions];

/**
 * A pipeline behavior entry can be either:
 * - A behavior class: `LoggingBehavior`
 * - A tuple of behavior class and options: `[AuditBehavior, { action: 'user.create', severity: 'high' }]`
 */
export type PipelineBehaviorEntry<
  TBehavior extends IPipelineBehavior = IPipelineBehavior,
  TOptions extends object = object,
> = Type<TBehavior> | PipelineBehaviorTuple<TBehavior, TOptions>;

/**
 * Declares handler-specific pipeline behaviors for a Nest CQRS command, query,
 * or event handler.
 *
 * Behaviors execute left-to-right: the first entry is the outermost wrapper.
 * Pass a behavior class for defaults, or `[Behavior, options]` for per-handler
 * options. Repeated identities run once at their first position; the last tuple
 * supplies their options and bare repeats preserve them. If the same behavior is also global, it runs once at the global
 * position and the handler options override the matching global option keys.
 *
 * Sagas are stream factories rather than per-request handlers and are not
 * decorated with `@UsePipeline`; commands emitted by a saga are wrapped when
 * they reach their command handler.
 *
 * @param entries - Behavior classes or `[Behavior, options]` tuples in execution order.
 * @returns A class decorator for a CQRS handler.
 *
 * @example
 * ```ts
 * @CommandHandler(CreateUserCommand)
 * @UsePipeline(LoggingBehavior, [AuditBehavior, { action: 'user.create', severity: 'high' }])
 * export class CreateUserHandler implements ICommandHandler<CreateUserCommand> { ... }
 *
 * @EventsHandler(OrderCreatedEvent)
 * @UsePipeline(LoggingBehavior)
 * export class OrderCreatedHandler implements IEventHandler<OrderCreatedEvent> { ... }
 * ```
 *
 * @example Security/reliability composition
 * ```ts
 * @UsePipeline(
 *   CaslBehavior,
 *   [RateLimitBehavior, { keyFactory: perUserRateLimitKey }],
 *   [IdempotencyBehavior, { keyFactory: createUserIdempotencyKey }],
 * )
 * export class CreateUserHandler {}
 * ```
 */
export function UsePipeline(
  ...entries: PipelineBehaviorEntry[]
): ClassDecorator {
  return (target) => {
    const { types: behaviors, options } = normalizeBehaviorEntries(
      entries,
      `@UsePipeline on ${target.name}`,
    );

    Reflect.defineMetadata(PIPELINE_BEHAVIORS_METADATA, behaviors, target);
    Reflect.defineMetadata(
      PIPELINE_BEHAVIORS_OPTIONS_METADATA,
      options,
      target,
    );
  };
}

/**
 * Excludes one or more global pipeline behaviors from executing for a specific handler.
 *
 * Use this when a global behavior (e.g. AuditBehavior, RateLimitBehavior) should
 * apply application-wide except to a specific command, query, or event handler.
 *
 * If a handler both skips and declares the same behavior (via `@UsePipeline` or options),
 * pipeline bootstrap fails immediately with an error.
 *
 * @param behaviorTypes - Behavior classes to skip.
 * @returns A class decorator for a CQRS handler.
 *
 * @example
 * ```ts
 * @CommandHandler(InternalRebuildCommand)
 * @SkipPipeline(AuditBehavior)
 * export class InternalRebuildHandler implements ICommandHandler<InternalRebuildCommand> { ... }
 * ```
 */
export function SkipPipeline(
  ...behaviorTypes: Type<IPipelineBehavior>[]
): ClassDecorator {
  return (target) => {
    const existing: Type<IPipelineBehavior>[] =
      Reflect.getMetadata(PIPELINE_SKIPPED_BEHAVIORS_METADATA, target) ?? [];
    Reflect.defineMetadata(
      PIPELINE_SKIPPED_BEHAVIORS_METADATA,
      normalizeBehaviorEntries(
        [...existing, ...behaviorTypes],
        `@SkipPipeline on ${target.name}`,
        false,
      ).types,
      target,
    );
  };
}
