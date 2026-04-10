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

import { LogLevel, Type } from '@nestjs/common';
import { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';
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
   * globalBehaviors: [{
   *   scope: 'commands',
   *   before: [[MetricsBehavior, { prefix: 'cmd' }]],
   *   after:  [AuditBehavior],
   * }]
   * ```
   */
  globalBehaviors?: GlobalBehaviorsOptions | GlobalBehaviorsOptions[];

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
   * Log level for the bootstrap "Wrapping ..." messages emitted when
   * the pipeline patches handler methods.
   *
   * - Any NestJS {@link LogLevel} value routes to the corresponding
   *   `Logger` method (`'log'`, `'debug'`, `'verbose'`, `'warn'`, `'error'`).
   * - `'none'` suppresses the message entirely.
   *
   * **When using `nestjs-pino`**, NestJS levels map to pino levels as follows:
   * | NestJS level | Pino level |
   * |---|---|
   * | `'verbose'` | `trace` |
   * | `'debug'` | `debug` |
   * | `'log'` | `info` |
   * | `'warn'` | `warn` |
   * | `'error'` | `error` |
   * | `'fatal'` | `fatal` |
   *
   * To see `'verbose'` logs, set `level: 'trace'` in `LoggerModule.forRoot`.
   *
   * @default 'debug'
   *
   * @example
   * ```ts
   * // Silence wrapping messages in production
   * bootstrapLogLevel: 'none'
   *
   * // Show wrapping messages only when verbose logging is enabled
   * bootstrapLogLevel: 'verbose'
   * ```
   */
  bootstrapLogLevel?: LogLevel | 'none';

  /**
   * Optional factory that provides a correlation ID for each pipeline run.
   *
   * When set, the factory is called before any behavior executes.
   * If it returns a string, that becomes the pipeline's `correlationId`.
   * If it returns `undefined` (or is not set), a `uuidv7()` fallback is generated.
   *
   * Integrates with `@nestjs-pipeline/correlation` — pass `getCorrelationId`
   * to bridge HTTP / message-queue correlation IDs into the pipeline:
   *
   * @example
   * ```ts
   * import { getCorrelationId } from '@nestjs-pipeline/correlation';
   *
   * PipelineModule.forRoot({
   *   behaviors: [LoggingBehavior],
   *   correlationIdFactory: getCorrelationId,
   * })
   * ```
   *
   * @example
   * ```ts
   * // Custom factory
   * correlationIdFactory: () => myCustomIdSource(),
   * ```
   */
  correlationIdFactory?: () => string | undefined;

  /**
   * Optional runner that wraps each pipeline invocation in a correlation context.
   *
   * When provided, every handler chain runs inside this wrapper **in addition to**
   * `pipelineStore`. This ensures that `getCorrelationId()` (from the correlation
   * package) returns the pipeline's `correlationId` throughout the entire handler —
   * including event handlers dispatched via `eventBus.publish()`.
   *
   * Pair with `correlationIdFactory` for full bidirectional correlation support:
   *
   * @example
   * ```ts
   * import { getCorrelationId, runWithCorrelationId } from '@nestjs-pipeline/correlation';
   *
   * PipelineModule.forRoot({
   *   correlationIdFactory: getCorrelationId,
   *   correlationIdRunner: runWithCorrelationId,
   * })
   * ```
   */
  correlationIdRunner?: <T>(correlationId: string, fn: () => T) => T;
}
