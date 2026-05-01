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
export const PIPELINE_BEHAVIOR_ID = Symbol('PIPELINE_BEHAVIOR_ID');

/**
 * Returns the stable deduplication key for a behavior class.
 * Prefers the explicit `PIPELINE_BEHAVIOR_ID` symbol, falls back to `cls.name`.
 */
export function getBehaviorId(cls: Type<IPipelineBehavior>): string {
  return (untyped(cls)[PIPELINE_BEHAVIOR_ID] as string) ?? cls.name;
}

/**
 * Static registry populated at decoration time.
 * Maps handler class name → Map<behaviorName, options>.
 *
 * Available immediately after module load — no runtime scanning needed.
 */
export const PIPELINE_OPTIONS_REGISTRY = new Map<
  string,
  Map<string, Record<string, unknown>>
>();

/**
 * Clears the static options registry. Useful in test teardown to prevent
 * stale entries from leaking across test suites (Jest --watch, module reloads).
 *
 * @example
 * ```ts
 * afterEach(() => clearPipelineOptionsRegistry());
 * ```
 */
export function clearPipelineOptionsRegistry(): void {
  PIPELINE_OPTIONS_REGISTRY.clear();
}

/**
 * A pipeline behavior entry can be either:
 * - A behavior class: `LoggingBehavior`
 * - A tuple of behavior class and options: `[AuditBehavior, { title: '...', message: '...' }]`
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
 * @UsePipeline(LoggingBehavior, [AuditBehavior, { title: 'User Created', message: '...' }])
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
    const options = new Map<string, Record<string, unknown>>();

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

    if (options.size > 0) {
      PIPELINE_OPTIONS_REGISTRY.set(target.name, options);
    }
  };
}
