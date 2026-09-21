/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
 * DI registration options for `PipelineModule.forFeature()`.
 *
 * Use this in a feature module that owns custom behavior providers while the
 * root application owns global pipeline configuration.
 *
 * @example
 * ```ts
 * @Module({
 *   imports: [
 *     PipelineModule.forFeature({
 *       imports: [BillingInfrastructureModule],
 *       behaviors: [BillingTelemetryBehavior],
 *     }),
 *   ],
 * })
 * export class BillingModule {}
 * ```
 */
export interface PipelineModuleFeatureOptions
  extends Pick<ModuleMetadata, 'imports'> {
  /**
   * Behavior providers to register and export application-wide.
   * Dependencies must be exported by the modules listed in `imports`.
   * Execution options belong in `@UsePipeline(...)` or root `globalBehaviors`.
   */
  behaviors: Type<IPipelineBehavior>[];
}

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
   * Optional Nest provider that binds {@link LOGGING_BEHAVIOR_LOGGER}.
   *
   * Use this to route pipeline logging through an application logger such as
   * nestjs-pino. The bound value must satisfy Nest's `LoggerService` contract.
   *
   * @example
   * ```ts
   * PipelineModule.forRoot({
   *   loggerProvider: {
   *     provide: LOGGING_BEHAVIOR_LOGGER,
   *     useExisting: NativeLogger,
   *   },
   * });
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
   * When configured, called before behaviors execute to populate `context.tenantId`.
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

  /**
   * Mode for validating behavior configuration contracts during application bootstrap.
   *
   * - `'strict'` (default): Fails application bootstrap immediately by throwing
   *   a {@link PipelineConfigurationError} when deterministic misconfigurations or
   *   ordering violations are discovered.
   * - `'warn'`: Logs validation diagnostics as warnings instead of failing bootstrap.
   * - `'off'`: Disables bootstrap validation diagnostics.
   *
   * @default 'strict'
   */
  diagnostics?: 'strict' | 'warn' | 'off';
}

/**
 * Runtime-safe subset of {@link PipelineModuleOptions}: everything an async
 * factory can still influence once Nest has built the provider graph.
 *
 * `behaviors` and `loggerProvider` are excluded because they are provider-graph
 * concerns. They belong on the {@link PipelineModuleAsyncOptions} call itself,
 * which is evaluated before the factory runs.
 */
export type PipelineRuntimeOptions = Omit<
  PipelineModuleOptions,
  'behaviors' | 'loggerProvider'
>;

/** Factory interface for classes that provide pipeline module options asynchronously. */
export interface PipelineOptionsFactory {
  createPipelineOptions():
    | Promise<PipelineRuntimeOptions>
    | PipelineRuntimeOptions;
}

/**
 * Options for configuring `PipelineModule.forRootAsync`.
 *
 * Provider-graph settings such as `behaviors`, `loggerProvider`, and
 * `extraProviders` are declared on this object. Runtime settings such as
 * correlation, tenant resolution, and global behavior composition are returned
 * by `useFactory` / `PipelineOptionsFactory`.
 *
 * @example Async composition with tenant and correlation context
 * ```ts
 * PipelineModule.forRootAsync({
 *   inject: [TenantSchemaContext],
 *   behaviors: [LoggingBehavior, ZodValidationBehavior, TraceBehavior],
 *   useFactory: (tenant: TenantSchemaContext) => ({
 *     correlationIdFactory: getCorrelationId,
 *     correlationIdRunner: runWithCorrelationId,
 *     tenantIdFactory: () => tenant.schema,
 *     globalBehaviors: {
 *       scope: 'all',
 *       before: [
 *         LoggingBehavior,
 *         [TraceBehavior, { tracerName: 'users-api' }],
 *         ZodValidationBehavior,
 *       ],
 *     },
 *   }),
 * });
 * ```
 */
export interface PipelineModuleAsyncOptions
  extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<PipelineOptionsFactory>;
  useClass?: Type<PipelineOptionsFactory>;
  useFactory?: (
    ...args: never[]
  ) => Promise<PipelineRuntimeOptions> | PipelineRuntimeOptions;
  inject?: (InjectionToken | OptionalFactoryDependency)[];

  /**
   * Behavior classes to register statically in the Nest DI graph before the
   * async options factory executes.
   *
   * Tuple entries are accepted for type compatibility, but only the behavior
   * class participates in provider registration. Put execution options in
   * `globalBehaviors` or `@UsePipeline(...)`.
   *
   * @example
   * ```ts
   * PipelineModule.forRootAsync({
   *   behaviors: [LoggingBehavior, AuditBehavior],
   *   useFactory: async () => ({
   *     globalBehaviors: { before: [LoggingBehavior] },
   *   }),
   * })
   * ```
   */
  behaviors?: (Type<IPipelineBehavior> | PipelineBehaviorEntry)[];

  /**
   * Optional static logger provider for async configuration.
   *
   * Declare it here because the async factory returns runtime configuration and
   * cannot alter Nest's already-built provider graph.
   */
  loggerProvider?: PipelineLoggerProvider;

  /**
   * Additional providers required by registered behaviors or custom factories.
   *
   * @example Bind the shared pipeline logger to an application logger
   * ```ts
   * extraProviders: [
   *   { provide: LOGGING_BEHAVIOR_LOGGER, useExisting: NativeLogger },
   * ]
   * ```
   */
  extraProviders?: Provider[];
}
