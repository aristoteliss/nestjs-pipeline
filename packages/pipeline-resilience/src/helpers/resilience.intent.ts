/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@nestjs-pipeline/core';
import type { ResilienceBehaviorOptions } from '../interfaces/resilience-options.interface';
import { ResilienceBehavior } from '../resilience.behavior';

export type ResilienceIntentOptions = ResilienceBehaviorOptions &
  (
    | { retry: NonNullable<ResilienceBehaviorOptions['retry']> }
    | {
        circuitBreaker: NonNullable<
          ResilienceBehaviorOptions['circuitBreaker']
        >;
      }
    | { timeout: NonNullable<ResilienceBehaviorOptions['timeout']> }
    | { bulkhead: NonNullable<ResilienceBehaviorOptions['bulkhead']> }
    | { fallback: NonNullable<ResilienceBehaviorOptions['fallback']> }
    | { policy: NonNullable<ResilienceBehaviorOptions['policy']> }
  );

/**
 * Returns a resilience behavior entry for `@UsePipeline`.
 * @param options At least one policy, plus optional classification and telemetry.
 * @returns The behavior class and options tuple. Runtime safety checks still apply:
 * retries on commands/events require `retry.replaySafe: true`; configure `handle`
 * to select retryable errors unless classification is supplied by module defaults.
 * @example
 * ```ts
 * @UsePipeline(resilience({
 *   handle: (error) => error instanceof TransientGatewayError,
 *   retry: { maxAttempts: 3, replaySafe: true },
 *   timeout: { duration: 5_000 },
 * }))
 * ```
 */
export function resilience(
  options: ResilienceIntentOptions,
): PipelineBehaviorTuple<ResilienceBehavior, ResilienceBehaviorOptions> {
  return [ResilienceBehavior, options];
}
