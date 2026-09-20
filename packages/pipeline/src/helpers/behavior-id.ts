/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Type } from '@nestjs/common';
import type { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';
import { untyped } from '../types/safe-typing';

/**
 * Optional static property on a behavior class that provides a stable,
 * unique identity for deduplication when global and handler behaviors overlap.
 *
 * Use this to recognize one behavior across multiple loaded copies of its package:
 *
 * ```ts
 * export class LoggingBehavior implements IPipelineBehavior {
 *   static readonly [PIPELINE_BEHAVIOR_ID] = 'my-package:LoggingBehavior';
 * }
 * ```
 *
 * When absent, the constructor reference is used as the fallback identity.
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
 * Returns the identity used to deduplicate a behavior and resolve its options.
 *
 * By default the constructor reference is the identity. A behavior that must be
 * recognized across multiple loaded copies of the same package can opt into a
 * stable string identity through {@link PIPELINE_BEHAVIOR_ID}.
 *
 * @param cls - Behavior class whose identity should be resolved.
 * @returns The constructor reference or the behavior's explicit stable id.
 *
 * @example Stable identity across duplicated package copies
 * ```ts
 * export class LoggingBehavior implements IPipelineBehavior {
 *   static readonly [PIPELINE_BEHAVIOR_ID] = 'my-package:LoggingBehavior';
 * }
 * ```
 */
export function getBehaviorId(cls: Type<IPipelineBehavior>): BehaviorId {
  return (untyped(cls)[PIPELINE_BEHAVIOR_ID] as string | undefined) ?? cls;
}
