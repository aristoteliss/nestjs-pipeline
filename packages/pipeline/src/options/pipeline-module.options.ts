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

import {
  ClassProvider,
  ExistingProvider,
  FactoryProvider,
  InjectionToken,
  LoggerService,
  LogLevel,
  ModuleMetadata,
  OptionalFactoryDependency,
  Provider,
  Type,
  ValueProvider,
} from '@nestjs/common';
import { LOGGING_BEHAVIOR_LOGGER } from '../behaviors/logging.behavior';
import { PipelineBehaviorEntry } from '../decorators/pipeline.decorator';
import { IPipelineBehavior } from '../interfaces/pipeline.behavior.interface';
import { GlobalBehaviorsOptions } from './global-behaviors.options';

/**
 * Injection token for pipeline module configuration.
 * @internal — consumed by {@link PipelineBootstrapService}.
 */
export const PIPELINE_MODULE_OPTIONS = Symbol('PIPELINE_MODULE_OPTIONS');

/** A Nest provider that is guaranteed to bind the pipeline logger token. */
export type PipelineLoggerProvider =
  | (Omit<ClassProvider<LoggerService>, 'provide'> & {
      provide: typeof LOGGING_BEHAVIOR_LOGGER;
    })
  | (Omit<ValueProvider<LoggerService>, 'provide'> & {
      provide: typeof LOGGING_BEHAVIOR_LOGGER;
    })
  | (Omit<FactoryProvider<LoggerService>, 'provide'> & {
      provide: typeof LOGGING_BEHAVIOR_LOGGER;
    })
  | (Omit<ExistingProvider, 'provide'> & {
      provide: typeof LOGGING_BEHAVIOR_LOGGER;
    });

/**
 * Configuration options for {@link PipelineModule.forRoot}.
 */
export interface PipelineModuleOptions {
  /**
   * Global behaviors applied to all Commands, Queries, and/or Events.
   * These are merged with handler-specific @UsePipeline behaviors.
   *
   * Execution order: `[before] → [@UsePipeline behaviors] → [after] → handler`.
   * A same-class handler declaration overrides options without relocating the
   * behavior from its global position.
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
   *   before: [[MetricsBehavior, { meterName: 'cmd' }]],
   *   after:  [AuditBehavior],
   * }]
   * ```
   */
  globalBehaviors?: GlobalBehaviorsOptions | GlobalBehaviorsOptions[];

  /**
   * Behavior classes to register in the DI container.
   *
   * Every class listed here becomes available for injection and can be
   * referenced in handler-level `@UsePipeline(...)` decorators. Listing a
   * behavior here only registers its provider; it does **not** make the
   * behavior execute globally. Use `globalBehaviors` for global execution.
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
   * @example
   * ```ts
   * // Use a custom logger provider for pipeline logging
   * PipelineModule.forRoot({
   *   loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: MyLogger },
   * })
   * ```
   * Optional custom logger provider token for `LOGGING_BEHAVIOR_LOGGER`.
   *
   * If provided, will be registered in the DI container and exported.
   * This allows using a custom logger (and DI binding) for pipeline logging
   * instead of the default (e.g., integrate with nestjs-pino or custom logger).
   *
   * **Note:** The logger must implement all methods from `LoggerService` (log, debug, verbose, warn, error, fatal),
   * or support the NestJS log level mapping (e.g., 'log' → 'info', 'verbose' → 'trace', etc.).
   *
   * Example:
   * ```ts
   * PipelineModule.forRoot({
   *   loggerProvider: { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: MyLogger },
   * })
   * ```
   */
  loggerProvider?: PipelineLoggerProvider;

  /**
   * Optional factory that provides a correlation ID for a root pipeline run.
   *
   * Correlation IDs are resolved before any behavior executes in this order:
   * inherited parent pipeline ID → `correlationIdFactory` result → `uuidv7()`.
   * Therefore the factory is not called for a nested pipeline invocation that
   * already inherited its parent's correlation ID. If the factory is called and
   * returns `undefined`, a `uuidv7()` fallback is generated.
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

  /**
   * Optional factory that resolves the active tenant ID for each pipeline execution.
   *
   * When configured, called before behaviors execute to populate `context.tenantId`
   * and `context.items.get(PIPELINE_TENANT_ID)`.
   *
   * @example
   * ```ts
   * PipelineModule.forRootAsync({
   *   inject: [TenantSchemaContext],
   *   useFactory: (tenantContext: TenantSchemaContext) => ({
   *     tenantIdFactory: () => tenantContext.schema,
   *   }),
   * })
   * ```
   */
  tenantIdFactory?: () => string | undefined;
}

/** Factory interface for classes that provide pipeline module options asynchronously. */
export interface PipelineOptionsFactory {
  createPipelineOptions():
    | Promise<PipelineModuleOptions>
    | PipelineModuleOptions;
}

/** Options for configuring `PipelineModule.forRootAsync`. */
export interface PipelineModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<PipelineOptionsFactory>;
  useClass?: Type<PipelineOptionsFactory>;
  useFactory?: (
    ...args: never[]
  ) => Promise<PipelineModuleOptions> | PipelineModuleOptions;
  inject?: (InjectionToken | OptionalFactoryDependency)[];
  behaviors?: (Type<IPipelineBehavior> | PipelineBehaviorEntry)[];
  extraProviders?: Provider[];
}
