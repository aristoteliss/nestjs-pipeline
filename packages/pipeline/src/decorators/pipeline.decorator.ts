/* Copyright (C) 2026-present Aristotelis — see repository license. */

import 'reflect-metadata';
import { Type } from '@nestjs/common';
import { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';
import { untyped } from '../types/safe-typing';

export const PIPELINE_BEHAVIORS_METADATA = Symbol('PIPELINE_BEHAVIORS');
export const PIPELINE_BEHAVIORS_OPTIONS_METADATA = Symbol(
  'PIPELINE_BEHAVIORS_OPTIONS',
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
 * Returns the deduplication key for a behavior class.
 *
 * The default is the constructor reference. Class names are not unique: two
 * modules can each export a `LoggingBehavior`, and keying on the name made the
 * pipeline treat them as the same behavior — running only one of them and
 * applying the other's options. When one of the two is a security guard, that is
 * a guard silently dropped from the chain.
 *
 * A class that genuinely needs to be recognized across two loaded copies of its
 * own package — a monorepo double-load, or two versions resolved side by side —
 * opts in by declaring a stable string:
 *
 * ```ts
 * class LoggingBehavior {
 *   static readonly [PIPELINE_BEHAVIOR_ID] = 'my-package:LoggingBehavior';
 * }
 * ```
 *
 * The key symbol is registered through `Symbol.for`, so two copies of this
 * package agree on it; a plain `Symbol()` would not, which would have defeated
 * the very cross-copy case the opt-in exists for.
 */
export function getBehaviorId(cls: Type<IPipelineBehavior>): BehaviorId {
  return (untyped(cls)[PIPELINE_BEHAVIOR_ID] as string | undefined) ?? cls;
}

/**
 * A pipeline behavior entry can be either:
 * - A behavior class: `LoggingBehavior`
 * - A tuple of behavior class and options: `[AuditBehavior, { action: 'user.create', severity: 'high' }]`
 */
export type PipelineBehaviorEntry =
  | Type<IPipelineBehavior>
  | [Type<IPipelineBehavior>, Record<string, unknown>];

/**
 * Decorator applied to a @CommandHandler, @QueryHandler, OR @EventsHandler class
 * to declare which pipeline behaviors wrap its execution, and in what order.
 *
 * Behaviors execute left-to-right: the first one listed is the outermost wrapper.
 * Options can be passed to individual behaviors using the tuple form.
 *
 * NOTE on Sagas: Sagas are NOT decorated with @UsePipeline because they are
 * reactive stream factories (events$ => Observable<ICommand>), not per-request
 * handlers. Commands emitted by sagas will flow through the CommandBus and
 * hit the pipeline of the target command handler automatically.
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
        options.set(getBehaviorId(entry[0]), entry[1]);
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
