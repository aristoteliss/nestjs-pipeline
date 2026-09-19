/* Copyright (C) 2026-present Aristotelis — see repository license. */

import 'reflect-metadata';
import { Type } from '@nestjs/common';
import { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';
import { untyped } from '../types/safe-typing';

export const PIPELINE_BEHAVIORS_METADATA = Symbol('PIPELINE_BEHAVIORS');
export const PIPELINE_BEHAVIORS_OPTIONS_METADATA = Symbol(
  'PIPELINE_BEHAVIORS_OPTIONS',
);
export const PIPELINE_SKIPPED_BEHAVIORS_METADATA = Symbol(
  'PIPELINE_SKIPPED_BEHAVIORS',
);

/**
 * Optional static property on a behavior class that provides a stable,
 * unique identity for deduplication when global and handler behaviors overlap.
 *
 * Use this when two different behavior classes share the same class name
 * (e.g. from different packages) and you need to tell them apart:
 *
 * ```ts
 * export class LoggingBehavior implements IPipelineBehavior {
 *   static readonly [PIPELINE_BEHAVIOR_ID] = 'my-package:LoggingBehavior';
 * }
 * ```
 *
 * When absent, `cls.name` is used as the fallback identity.
 */
export const PIPELINE_BEHAVIOR_ID = Symbol.for(
  '@nestjs-pipeline/core:PIPELINE_BEHAVIOR_ID',
);

/**
 * Identity of a behavior for deduplication and option lookup.
 *
 * Either the constructor itself — the default, and exact — or the string a class
 * opted into through {@link PIPELINE_BEHAVIOR_ID}.
 */
export type BehaviorId = string | Type<IPipelineBehavior>;

/**
 * Returns the identity used to deduplicate a behavior and resolve its options.
 *
 * By default the constructor reference is the identity. A behavior that must be
 * recognized across multiple loaded copies of the same package can opt into a
 * stable string identity through {@link PIPELINE_BEHAVIOR_ID}.
 *
 * @param cls - Behavior class whose identity should be resolved.
 * @returns The constructor reference or the behavior's explicit stable id.
 *
 * @example Stable identity across duplicated package copies
 * ```ts
 * export class LoggingBehavior implements IPipelineBehavior {
 *   static readonly [PIPELINE_BEHAVIOR_ID] = 'my-package:LoggingBehavior';
 * }
 * ```
 */
export function getBehaviorId(cls: Type<IPipelineBehavior>): BehaviorId {
  return (untyped(cls)[PIPELINE_BEHAVIOR_ID] as string | undefined) ?? cls;
}

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
 * options. If the same behavior is also global, it runs once at the global
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
    const behaviors: Type<IPipelineBehavior>[] = [];
    const options = new Map<BehaviorId, Record<string, unknown>>();

    for (const entry of entries) {
      if (Array.isArray(entry)) {
        behaviors.push(entry[0]);
        options.set(
          getBehaviorId(entry[0]),
          entry[1] as Record<string, unknown>,
        );
      } else {
        behaviors.push(entry);
      }
    }

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
      [...existing, ...behaviorTypes],
      target,
    );
  };
}
