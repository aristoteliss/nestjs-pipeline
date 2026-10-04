/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  getBehaviorId,
  type IPipelineBehavior,
  pipelineOf,
} from '@cqrs-ddd/pipeline';
import type { Type } from '@nestjs/common';

/**
 * The options `handler` declares for `behavior` in its `@UsePipeline`, so a
 * spec exercises the key factories the handler really runs with.
 *
 * @throws {Error} When the handler declares no options for the behavior.
 *
 * @example
 * ```ts
 * const { keyFactory } = declaredOptions<IdempotencyBehaviorOptions>(
 *   CreateUserHandler,
 *   IdempotencyBehavior,
 * );
 * ```
 */
export function declaredOptions<T>(
  handler: Type<unknown>,
  behavior: Type<IPipelineBehavior>,
): T {
  const declared = pipelineOf(handler).options.get(getBehaviorId(behavior)) as
    | T
    | undefined;
  if (!declared) {
    throw new Error(`${handler.name} declares no ${behavior.name} options.`);
  }
  return declared;
}

/**
 * The key `factory` derives for `context`, for reading the record a behavior
 * stored under it.
 *
 * @throws {Error} When the factory derives no key for the context.
 *
 * @example
 * ```ts
 * const record = await store.get(requiredKey(keyFactory, context));
 * ```
 */
export function requiredKey<TContext>(
  factory: (context: TContext) => string | undefined,
  context: TContext,
): string {
  const key = factory(context);
  if (key === undefined) throw new Error('The key factory derived no key.');
  return key;
}
