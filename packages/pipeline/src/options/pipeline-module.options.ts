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
import type { ContextSources } from '../interfaces/context-source.interface';
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
   * // Apply LoggingBehavior before every command, query, and event handler
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
   * behaviors: [LoggingBehavior, AuditBehavior, CacheBehavior]
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

  /**
   * Where pipelines take their tenant and correlation id from, such as
   * `tenantSource` of `@nestjs-pipeline/tenant` and `correlationSource` of
   * `@nestjs-pipeline/correlation`. See {@link ContextSources}. When it is
   * omitted and a handler is wrapped, bootstrap logs a warning, because
   * handlers then cannot read the pipeline's tenant or correlation id; pass
   * `{}` to run without sources on purpose.
   *
   * @example
   * ```ts
   * sources: { tenantId: tenantSource, correlationId: correlationSource }
   * ```
   */
  sources?: ContextSources;
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
 * `extraProviders` are declared on this object, together with any global
 * behaviors that do not depend on injected values. Runtime settings such as
 * diagnostics and dynamic global behavior composition are returned by
 * `useFactory` / `PipelineOptionsFactory`.
 *
 * @example Async composition
 * ```ts
 * PipelineModule.forRootAsync({
 *   inject: [ConfigService],
 *   behaviors: [LoggingBehavior, ZodValidationBehavior, TraceBehavior],
 *   useFactory: (config: ConfigService) => ({
 *     diagnostics: config.get('PIPELINE_DIAGNOSTICS'),
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
   * Global behaviors known before the async factory runs.
   *
   * Their behavior classes are registered as providers, exactly as with
   * `PipelineModule.forRoot({ globalBehaviors })`, so they need no separate
   * `behaviors` entry. Configs returned by the factory are appended after
   * these. A behavior keeps the position of its first occurrence across both
   * lists; a later tuple for the same behavior supplies its options only.
   * Behaviors that appear only in factory-returned configs must still be
   * listed in `behaviors`.
   *
   * @example
   * ```ts
   * PipelineModule.forRootAsync({
   *   inject: [ConfigService],
   *   globalBehaviors: { scope: 'all', before: [LoggingBehavior] },
   *   useFactory: (config: ConfigService) => ({
   *     diagnostics: config.get('PIPELINE_DIAGNOSTICS'),
   *   }),
   * })
   * ```
   */
  globalBehaviors?: GlobalBehaviorsOptions | GlobalBehaviorsOptions[];

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
