/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { PipelineBehaviorTuple } from '@nestjs-pipeline/core';
import { CaslBehavior, type CaslBehaviorOptions } from '../casl.behavior';
import type { AbilityRequirement } from '../types/casl.types';

export type AuthorizeOptions = Omit<
  CaslBehaviorOptions,
  'rules' | 'skipCheck'
> &
  (
    | (AbilityRequirement & { rules?: never; skipCheck?: false })
    | {
        rules: [AbilityRequirement, ...AbilityRequirement[]];
        action?: never;
        subject?: never;
        field?: never;
        skipCheck?: false;
      }
    | {
        skipCheck: true;
        rules?: never;
        action?: never;
        subject?: never;
        field?: never;
      }
  );

/**
 * Returns a CASL behavior entry for `@UsePipeline`.
 * @param options A single permission requirement, a non-empty `rules` list, or
 * explicit `skipCheck: true`. A `prebuiltAbility` supplies permissions but does
 * not replace the requirement that selects what to check.
 * @returns The behavior class and options tuple. Every requirement must pass;
 * the behavior throws UnauthorizedActionException when authorization fails.
 * Use `field` for field checks and separate rules to check multiple fields.
 * Persisted-entity authorization still belongs after loading the aggregate.
 * @example
 * ```ts
 * @UsePipeline(authorize({ action: 'update', subject: 'Post', field: 'title' }))
 * @UsePipeline(authorize({ rules: [
 *   { action: 'update', subject: 'Post', field: 'title' },
 *   { action: 'update', subject: 'Post', field: 'body' },
 * ] }))
 * ```
 */
export function authorize(
  options: AuthorizeOptions,
): PipelineBehaviorTuple<CaslBehavior, CaslBehaviorOptions> {
  if (options.action !== undefined) {
    const { action, subject, field, ...rest } = options;
    return [
      CaslBehavior,
      {
        ...rest,
        rules: [{ action, subject, ...(field !== undefined ? { field } : {}) }],
      },
    ];
  }
  return [CaslBehavior, options];
}
