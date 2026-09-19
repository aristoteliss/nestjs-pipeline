/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@nestjs-pipeline/core';
import type { RateLimitBehaviorOptions } from '../interfaces/rate-limit-options.interface';
import { RateLimitBehavior } from '../rate-limit.behavior';

export type RateLimitIntentOptions = Omit<
  RateLimitBehaviorOptions,
  'keyFactory'
> &
  (
    | {
        keyFactory: NonNullable<RateLimitBehaviorOptions['keyFactory']>;
        inheritModuleKey?: never;
      }
    | { inheritModuleKey: true; keyFactory?: never }
  );

/**
 * Returns a rate-limit behavior entry for `@UsePipeline`.
 * @param options A key factory and rate-limit options, or `inheritModuleKey: true`
 * when the module supplies the key factory. The inheritance marker is not
 * forwarded to the behavior and does not validate module configuration.
 * @returns The behavior class and options tuple.
 * Use `createPartitionedRateLimitKeyFactory` for tenant/caller-specific limits.
 * @example
 * ```ts
 * @UsePipeline(rateLimit({ keyFactory: perUserKey, points: 1 }))
 * @UsePipeline(rateLimit({ inheritModuleKey: true, points: 2 }))
 * ```
 */
export function rateLimit(
  options: RateLimitIntentOptions,
): PipelineBehaviorTuple<RateLimitBehavior, RateLimitBehaviorOptions> {
  const { inheritModuleKey: _inheritModuleKey, ...behaviorOptions } = options;
  return [RateLimitBehavior, behaviorOptions];
}
