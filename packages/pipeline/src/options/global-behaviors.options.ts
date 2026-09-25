/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { PipelineBehaviorEntry } from '../decorators/pipeline.decorator';

/** Determines which handler kinds global behaviors apply to. */
export type GlobalBehaviorScope = 'commands' | 'queries' | 'events' | 'all';

/**
 * Configuration for behaviors that are automatically applied to all
 * Commands, Queries, and/or Events, regardless of handler-level @UsePipeline.
 *
 * Execution order:
 * `[before] → [@UsePipeline behaviors] → [after] → handler`. If the same
 * behavior class is declared globally and by a handler, it runs once at its
 * global position with the handler's options.
 *
 * @example
 * ```ts
 * // Single object
 * globalBehaviors: {
 *   scope: 'all',
 *   before: [LoggingBehavior, [MetricsBehavior, { meterName: 'api' }]],
 *   after:  [AuditBehavior],
 * }
 *
 * // Array — different scopes for different handler kinds
 * globalBehaviors: [
 *   { scope: 'commands', before: [AuditBehavior] },
 *   { scope: 'queries',  before: [CacheBehavior] },
 *   { scope: 'all',      after:  [LoggingBehavior] },
 * ]
 * ```
 */
export interface GlobalBehaviorsOptions {
  /**
   * Which handler kinds these behaviors apply to.
   * - `'commands'` — only command handlers
   * - `'queries'`  — only query handlers
   * - `'events'`   — only event handlers
   * - `'all'`      — commands, queries, and events
   *
   * @default 'all'
   */
  scope?: GlobalBehaviorScope;

  /**
   * Behaviors prepended BEFORE handler-specific @UsePipeline behaviors.
   * These run first (outermost) in the pipeline chain.
   */
  before?: PipelineBehaviorEntry[];

  /**
   * Behaviors appended AFTER handler-specific @UsePipeline behaviors
   * (still before the actual handler execution).
   * These run closest to the handler, after all other behaviors.
   */
  after?: PipelineBehaviorEntry[];
}
