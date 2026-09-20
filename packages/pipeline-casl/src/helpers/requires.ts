/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@nestjs-pipeline/core';
import { CaslBehavior, type CaslBehaviorOptions } from '../casl.behavior';
import type { AbilityRequirement } from '../types/casl.types';

/**
 * `[CaslBehavior, { rules }]` for `@UsePipeline`; every requirement must pass.
 *
 * @example
 * ```ts
 * @UsePipeline(requires({ action: 'read', subject: 'User' }))
 * @UsePipeline(requires(
 *   { action: 'update', subject: 'Post', field: 'title' },
 *   { action: 'update', subject: 'Post', field: 'body' },
 * ))
 * ```
 */
export function requires(
  ...rules: [AbilityRequirement, ...AbilityRequirement[]]
): PipelineBehaviorTuple<CaslBehavior, CaslBehaviorOptions> {
  return [CaslBehavior, { rules }];
}
