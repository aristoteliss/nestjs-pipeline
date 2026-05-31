/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { PipelineBehaviorEntry } from '../decorators/pipeline.decorator';

/** Determines which handler kinds global behaviors apply to. */
export type GlobalBehaviorScope = 'commands' | 'queries' | 'events' | 'all';

/**
 * Configuration for behaviors that are automatically applied to all
 * Commands, Queries, and/or Events, regardless of handler-level @UsePipeline.
 *
 * Execution order:
 * `[before] → [@UsePipeline behaviors] → [after] → handler`
 *
 * @example
 * ```ts
 * // Single object
 * globalBehaviors: {
 *   scope: 'all',
 *   before: [LoggingBehavior, [MetricsBehavior, { prefix: 'api' }]],
 *   after:  [AuditBehavior],
 * }
 *
 * // Array — different scopes for different handler kinds
 * globalBehaviors: [
 *   { scope: 'commands', before: [AuditBehavior] },
 *   { scope: 'queries',  before: [CachingBehavior] },
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
