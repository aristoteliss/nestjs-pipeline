/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@nestjs-pipeline/core';
import { FeatureFlagBehavior } from '../feature-flag.behavior';
import type { FeatureFlagBehaviorOptions } from '../interfaces/feature-flags-options.interface';

export type FeatureFlagIntentOptions = FeatureFlagBehaviorOptions & {
  flag: string;
};

/**
 * Returns a feature-flag behavior entry for `@UsePipeline`.
 * @param options Required flag key plus evaluation and fallback options.
 * @returns The behavior class and options tuple. A disabled flag prevents handler
 * execution; the behavior returns the configured fallback or throws FeatureDisabledError.
 * @example
 * ```ts
 * @UsePipeline(featureFlag({
 *   flag: 'user-registration',
 *   defaultValue: false,
 *   fallback: () => ({ disabled: true }),
 * }))
 * ```
 */
export function featureFlag(
  options: FeatureFlagIntentOptions,
): PipelineBehaviorTuple<FeatureFlagBehavior, FeatureFlagBehaviorOptions> {
  return [FeatureFlagBehavior, options];
}
