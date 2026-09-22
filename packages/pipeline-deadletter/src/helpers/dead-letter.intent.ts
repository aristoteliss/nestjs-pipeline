/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@nestjs-pipeline/core';
import { DeadLetterBehavior } from '../dead-letter.behavior';
import type { DeadLetterBehaviorOptions } from '../interfaces/dead-letter-options.interface';

export type DeadLetterIntentOptions = DeadLetterBehaviorOptions;

/**
 * Returns a dead-letter behavior entry for `@UsePipeline`.
 * @param options Per-handler dead-letter options; omitted fields use behavior defaults.
 * @returns The behavior class and options tuple.
 * @example
 * ```ts
 * @UsePipeline(deadLetter({ redactKeys: ['refreshToken'] }))
 * @UsePipeline(deadLetter({ rethrow: false }))
 * ```
 */
export function deadLetter(
  options: DeadLetterIntentOptions = {},
): PipelineBehaviorTuple<DeadLetterBehavior, DeadLetterBehaviorOptions> {
  return [DeadLetterBehavior, options];
}
