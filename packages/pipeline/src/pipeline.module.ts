/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DynamicModule, Global, Module, Provider, Type } from '@nestjs/common';
import { LOGGING_BEHAVIOR_LOGGER } from './behaviors/logging.behavior';
import { PipelineBehaviorEntry } from './decorators/pipeline.decorator';
import { IPipelineBehavior } from './interfaces/pipeline.behavior.interface';
import {
  PIPELINE_MODULE_OPTIONS,
  PipelineModuleAsyncOptions,
  PipelineModuleOptions,
  PipelineOptionsFactory,
} from './options/pipeline-module.options';
import { PipelineBootstrapService } from './services/pipeline.bootstrap.service';

// Re-export the option types so they can be imported from this module too.
export {
  GlobalBehaviorScope,
  GlobalBehaviorsOptions,
  PipelineModuleAsyncOptions,
  PipelineModuleOptions,
  PipelineOptionsFactory,
  PipelineRuntimeOptions,
} from './options';

/**
 * Extracts the behavior class (Type) from each entry,
 * discarding inline options used by the tuple form.
 */
function extractBehaviorTypes(
  entries: PipelineBehaviorEntry[],
): Type<IPipelineBehavior>[] {
  return entries.map((entry) => (Array.isArray(entry) ? entry[0] : entry));
}

/**
 * Import this module once in your AppModule (or CommonModule).
 *
 * @example
 * ```ts
 * // Simple — register behavior providers for @UsePipeline references
 * PipelineModule.forRoot([LoggingBehavior, AuditBehavior])
 * // The bare array is equivalent to { behaviors: [...] }; it does not make
 * // those behaviors execute globally. Use globalBehaviors for that.
 *
 * // Advanced — global behaviors + correlation ID factory
 * PipelineModule.forRoot({
 *   behaviors: [LoggingBehavior],
 *   globalBehaviors: { scope: 'all', before: [MetricsBehavior] },
 *   correlationIdFactory: () => myCorrelationSource(),
 * })
 *
 * // Per-kind scoping with array form
 * PipelineModule.forRoot({
 *   globalBehaviors: [
 *     { scope: 'commands', before: [AuditBehavior] },
 *     { scope: 'queries',  before: [CachingBehavior] },
 *     { scope: 'all',      after:  [LoggingBehavior] },
 *   ],
 * })
 *
 * // Integration with @nestjs-pipeline/correlation
 * import {
 *   getCorrelationId,
 *   runWithCorrelationId,
 * } from '@nestjs-pipeline/correlation';
 * PipelineModule.forRoot({
 *   behaviors: [LoggingBehavior],
 *   correlationIdFactory: getCorrelationId,
 *   correlationIdRunner: runWithCorrelationId,
 * })
 * ```
 *
 * Correlation ID resolution order (before any behavior runs):
 * 1. Parent pipeline context (saga / nested command)
 * 2. `correlationIdFactory` — user-supplied factory from module options
 * 3. `uuidv7()` fallback (timestamp-sortable UUID)
 */
@Global()
@Module({})
export class PipelineModule {
  /**
   * Configures the pipeline as a global dynamic module.
   *
   * Accepts either a bare array of behavior classes (DI registration only) or a
   * {@link PipelineModuleOptions} object (global before/after behaviors,
   * correlation-id bridging, logger provider, etc.). Registers all behavior
   * classes for DI — deduplicating global behaviors already listed in
   * `behaviors` — and the {@link PipelineBootstrapService} that wraps handlers.
   * A bare array does not attach the listed behaviors to handlers globally.
   *
   * @param optionsOrBehaviors - A list of behavior classes to register, or full module options.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRoot(
    optionsOrBehaviors: PipelineModuleOptions | Type<IPipelineBehavior>[] = [],
  ): DynamicModule {
    const options: PipelineModuleOptions = Array.isArray(optionsOrBehaviors)
      ? { behaviors: optionsOrBehaviors }
      : optionsOrBehaviors;

    if (
      options.loggerProvider &&
      options.loggerProvider.provide !== LOGGING_BEHAVIOR_LOGGER
    ) {
      throw new TypeError(
        'loggerProvider must bind the LOGGING_BEHAVIOR_LOGGER token.',
      );
    }

    const behaviors = options.behaviors ?? [];

    // Extract global behavior types for DI registration (deduplicated against `behaviors`)
    const globalConfigs = options.globalBehaviors
      ? Array.isArray(options.globalBehaviors)
        ? options.globalBehaviors
        : [options.globalBehaviors]
      : [];
    const globalBehaviorTypes = extractBehaviorTypes(
      globalConfigs.flatMap((cfg) => [
        ...(cfg.before ?? []),
        ...(cfg.after ?? []),
      ]),
    ).filter((t) => !behaviors.includes(t));

    return {
      module: PipelineModule,
      providers: [
        { provide: PIPELINE_MODULE_OPTIONS, useValue: options },
        PipelineBootstrapService,
        ...globalBehaviorTypes,
        ...behaviors,
        ...(options.loggerProvider ? [options.loggerProvider] : []),
      ],
      exports: [
        ...globalBehaviorTypes,
        ...behaviors,
        ...(options.loggerProvider ? [LOGGING_BEHAVIOR_LOGGER] : []),
      ],
    };
  }

  /**
   * Registers the pipeline module asynchronously, allowing options to be provided
   * via an injected factory provider (e.g. from another module or async configuration).
   *
   * Provider-graph concerns must be known before the async factory executes.
   * `behaviors` has always been a static `forRootAsync` field; `loggerProvider`
   * can now be declared there as well. For backward compatibility, factories
   * still return the full {@link PipelineModuleOptions} type, but provider-graph
   * fields returned by the factory cannot retroactively register Nest providers.
   *
   * @param options - Async factory, its injected providers, behaviors, and optional imports.
   * @returns The configured global {@link DynamicModule}.
   *
   * @example
   * ```ts
   * PipelineModule.forRootAsync({
   *   imports: [PersistenceModule],
   *   inject: [TenantSchemaContext],
   *   behaviors: [LoggingBehavior, ZodValidationBehavior],
   *   loggerProvider: {
   *     provide: LOGGING_BEHAVIOR_LOGGER,
   *     useExisting: MyLogger,
   *   },
   *   useFactory: (tenantContext: TenantSchemaContext) => ({
   *     tenantIdFactory: () => tenantContext.schema,
   *     globalBehaviors: [{ scope: 'all', before: [LoggingBehavior] }],
   *   }),
   * })
   * ```
   */
  static forRootAsync(options: PipelineModuleAsyncOptions): DynamicModule {
    if (
      options.loggerProvider &&
      options.loggerProvider.provide !== LOGGING_BEHAVIOR_LOGGER
    ) {
      throw new TypeError(
        'loggerProvider must bind the LOGGING_BEHAVIOR_LOGGER token.',
      );
    }

    const behaviors = extractBehaviorTypes(options.behaviors ?? []);
    const asyncProviders = PipelineModule.createAsyncProviders(options);

    return {
      module: PipelineModule,
      global: true,
      imports: options.imports ?? [],
      providers: [
        ...asyncProviders,
        PipelineBootstrapService,
        ...behaviors,
        ...(options.extraProviders ?? []),
        ...(options.loggerProvider ? [options.loggerProvider] : []),
      ],
      exports: [
        ...behaviors,
        PipelineBootstrapService,
        ...(options.extraProviders
          ? options.extraProviders
              .map((p) =>
                typeof p === 'object' && p !== null && 'provide' in p
                  ? p.provide
                  : p,
              )
              .filter(Boolean)
          : []),
        ...(options.loggerProvider ? [LOGGING_BEHAVIOR_LOGGER] : []),
      ],
    };
  }

  private static createAsyncProviders(
    options: PipelineModuleAsyncOptions,
  ): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [PipelineModule.createAsyncOptionsProvider(options)];
    }
    if (options.useClass) {
      return [
        PipelineModule.createAsyncOptionsProvider(options),
        {
          provide: options.useClass,
          useClass: options.useClass,
        },
      ];
    }
    return [];
  }

  private static createAsyncOptionsProvider(
    options: PipelineModuleAsyncOptions,
  ): Provider {
    if (options.useFactory) {
      return {
        provide: PIPELINE_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      };
    }
    const inject = [
      (options.useClass || options.useExisting) as Type<PipelineOptionsFactory>,
    ];
    return {
      provide: PIPELINE_MODULE_OPTIONS,
      useFactory: async (optionsFactory: PipelineOptionsFactory) =>
        optionsFactory.createPipelineOptions(),
      inject,
    };
  }

  /**
   * Register feature-owned pipeline behavior classes application-wide.
   *
   * Use this in any module that owns behaviors referenced by
   * `@UsePipeline(...)` decorators. {@link PipelineModule} is global and the
   * pipeline bootstrap resolves behavior providers across the application, so
   * `forFeature()` expresses ownership/organization, not Nest DI isolation.
   * Once the importing feature module is part of the application graph, these
   * behaviors can be referenced by handlers in any module.
   *
   * @example
   * ```ts
   * @Module({
   *   imports: [PipelineModule.forFeature([AuditBehavior])],
   * })
   * export class AuditLogModule {}
   * ```
   */
  static forFeature(behaviors: Type<IPipelineBehavior>[]): DynamicModule {
    return {
      global: true,
      module: PipelineModule,
      providers: [...behaviors],
      exports: [...behaviors],
    };
  }
}
