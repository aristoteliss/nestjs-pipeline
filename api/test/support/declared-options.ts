/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Type } from '@nestjs/common';
import {
  type BehaviorId,
  getBehaviorId,
  type IPipelineBehavior,
  PIPELINE_BEHAVIORS_OPTIONS_METADATA,
} from '@nestjs-pipeline/core';

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
  const options = Reflect.getMetadata(
    PIPELINE_BEHAVIORS_OPTIONS_METADATA,
    handler,
  ) as Map<BehaviorId, T> | undefined;
  const declared = options?.get(getBehaviorId(behavior));
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
