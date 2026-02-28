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
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { Type } from '@nestjs/common';
import { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';
import { CorrelationOptions } from './correlation.options';
import { GlobalBehaviorsOptions } from './global-behaviors.options';

/**
 * Injection token for pipeline module configuration.
 * @internal — consumed by {@link PipelineBootstrapService}.
 */
export const PIPELINE_MODULE_OPTIONS = Symbol('PIPELINE_MODULE_OPTIONS');

/**
 * Configuration options for {@link PipelineModule.forRoot}.
 */
export interface PipelineModuleOptions {
  /**
   * Global behaviors applied to all Commands, Queries, and/or Events.
   * These are merged with handler-specific @UsePipeline behaviors.
   *
   * Execution order: `[before] → [@UsePipeline behaviors] → [after] → handler`
   *
   * @example
   * ```ts
   * // Apply LoggingBehavior before ALL command & query handlers
   * globalBehaviors: {
   *   before: [LoggingBehavior],
   * }
   *
   * // Apply only to commands, with options
   * globalBehaviors: {
   *   scope: 'commands',
   *   before: [[MetricsBehavior, { prefix: 'cmd' }]],
   *   after:  [AuditBehavior],
   * }
   * ```
   */
  globalBehaviors?: GlobalBehaviorsOptions;

  /**
   * Behavior classes to register in the DI container.
   *
   * Every class listed here becomes available for injection and can be
   * referenced in handler-level `@UsePipeline(...)` decorators.
   * Global behaviors specified in `globalBehaviors` are registered
   * automatically — you do not need to duplicate them here.
   *
   * @example
   * ```ts
   * behaviors: [LoggingBehavior, AuditBehavior, CachingBehavior]
   * ```
   */
  behaviors?: Type<IPipelineBehavior>[];

  /**
   * How the pipeline obtains a correlation ID from HTTP requests.
   *
   * For non-HTTP transports (Bull, RabbitMQ, WebSocket, etc.),
   * use `runWithCorrelationId()` in your processor or handler.
   *
   * @default `{ header: 'x-correlation-id' }`
   *
   * @example
   * ```ts
   * // Custom header
   * correlation: { header: 'x-request-id' }
   *
   * // Disable HTTP middleware (worker-only app)
   * correlation: { header: false }
   * ```
   */
  correlation?: CorrelationOptions;
}
