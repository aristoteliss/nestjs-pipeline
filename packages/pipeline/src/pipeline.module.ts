/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DynamicModule, Global, Module, Provider, Type } from '@nestjs/common';
import { LOGGING_BEHAVIOR_LOGGER } from './behaviors/logging.behavior';
import { PipelineBehaviorEntry } from './decorators/pipeline.decorator';
import { behaviorEntryType } from './helpers/behavior-entries';
import { IPipelineBehavior } from './interfaces/pipeline.behavior.interface';
import type { GlobalBehaviorsOptions } from './options/global-behaviors.options';
import {
  PIPELINE_MODULE_OPTIONS,
  PipelineModuleAsyncOptions,
  PipelineModuleFeatureOptions,
  PipelineModuleOptions,
  PipelineOptionsFactory,
  PipelineRuntimeOptions,
} from './options/pipeline-module.options';
import { PipelineBootstrapService } from './services/pipeline.bootstrap.service';
import { toGlobalConfigs } from './services/pipeline-plan';

// Re-export the option types so they can be imported from this module too.
export {
  GlobalBehaviorScope,
  GlobalBehaviorsOptions,
  PipelineModuleAsyncOptions,
  PipelineModuleFeatureOptions,
  PipelineModuleOptions,
  PipelineOptionsFactory,
  PipelineRuntimeOptions,
} from './options';

/**
 * Validates that an async options factory returns runtime-only configuration.
 *
 * Nest builds the provider graph before the factory executes, so provider-graph
 * fields such as `behaviors` and `loggerProvider` must be declared directly on
 * `PipelineModule.forRootAsync(...)`.
 */
function assertRuntimeOptions(
  options: PipelineRuntimeOptions,
  source: string,
): PipelineRuntimeOptions {
  const declared = ['behaviors', 'loggerProvider'].filter(
    (field) => (options as Record<string, unknown>)?.[field] !== undefined,
  );
  if (declared.length > 0) {
    throw new TypeError(
      `${source} returned ${declared.join(' and ')}, which Nest cannot register ` +
        'after the provider graph is built. Declare them on the ' +
        'PipelineModule.forRootAsync({ ... }) call instead of returning them.',
    );
  }
  return options;
}

/** Resolves provider registration shared by synchronous and asynchronous setup. */
function resolveBehaviorRegistration(
  options: Pick<
    PipelineModuleAsyncOptions,
    'behaviors' | 'globalBehaviors' | 'loggerProvider'
  >,
) {
  if (
    options.loggerProvider &&
    options.loggerProvider.provide !== LOGGING_BEHAVIOR_LOGGER
  ) {
    throw new TypeError(
      'loggerProvider must bind the LOGGING_BEHAVIOR_LOGGER token.',
    );
  }

  const behaviors = extractBehaviorTypes(options.behaviors ?? []);
  const globalConfigs = toGlobalConfigs(options.globalBehaviors);
  const globalTypes = extractBehaviorTypes(
    globalConfigs.flatMap((cfg) => [
      ...(cfg.before ?? []),
      ...(cfg.after ?? []),
    ]),
  ).filter((type) => !behaviors.includes(type));
  return { behaviors: [...globalTypes, ...behaviors], globalConfigs };
}

/**
 * Places statically declared global configs ahead of factory-returned ones.
 * Behavior placement is fixed by the first occurrence across the combined
 * list, so a factory entry for a static behavior can supply its options but
 * cannot move it.
 */
function withStaticGlobals(
  runtime: PipelineRuntimeOptions,
  staticGlobals: GlobalBehaviorsOptions[],
): PipelineRuntimeOptions {
  if (staticGlobals.length === 0) return runtime;
  return {
    ...runtime,
    globalBehaviors: [
      ...staticGlobals,
      ...toGlobalConfigs(runtime?.globalBehaviors),
    ],
  };
}

/**
 * Extracts the behavior class (Type) from each entry,
 * discarding inline options used by the tuple form.
 */
function extractBehaviorTypes(
  entries: PipelineBehaviorEntry[],
): Type<IPipelineBehavior>[] {
  return [
    ...new Set(
      entries.map((entry, index) =>
        behaviorEntryType(entry, `PipelineModule behaviors, entry ${index}`),
      ),
    ),
  ];
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

    const { behaviors } = resolveBehaviorRegistration(options);

    return {
      module: PipelineModule,
      providers: [
        { provide: PIPELINE_MODULE_OPTIONS, useValue: options },
        PipelineBootstrapService,
        ...behaviors,
        ...(options.loggerProvider ? [options.loggerProvider] : []),
      ],
      exports: [
        ...behaviors,
        ...(options.loggerProvider ? [LOGGING_BEHAVIOR_LOGGER] : []),
      ],
    };
  }

  /**
   * Registers the pipeline module asynchronously, allowing options to be provided
   * via an injected factory provider (e.g. from another module or async configuration).
   *
   * Provider-graph concerns must be known before the async factory executes,
   * so `behaviors` and `loggerProvider` are static fields of this call. A
   * factory returns {@link PipelineRuntimeOptions}, which excludes them: Nest
   * has already built the provider graph by the time the factory runs, so
   * returning them there would register nothing. The type rejects it at compile
   * time, and {@link assertRuntimeOptions} rejects it at bootstrap for callers
   * who reach this API without the types.
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
    const { behaviors, globalConfigs } = resolveBehaviorRegistration(options);
    const asyncProviders = PipelineModule.createAsyncProviders(
      options,
      globalConfigs,
    );

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
    staticGlobals: GlobalBehaviorsOptions[],
  ): Provider[] {
    if (options.useExisting || options.useFactory) {
      return [
        PipelineModule.createAsyncOptionsProvider(options, staticGlobals),
      ];
    }
    if (options.useClass) {
      return [
        PipelineModule.createAsyncOptionsProvider(options, staticGlobals),
        {
          provide: options.useClass,
          useClass: options.useClass,
        },
      ];
    }
    if (staticGlobals.length > 0) {
      return [
        {
          provide: PIPELINE_MODULE_OPTIONS,
          useValue: { globalBehaviors: staticGlobals },
        },
      ];
    }
    return [];
  }

  private static createAsyncOptionsProvider(
    options: PipelineModuleAsyncOptions,
    staticGlobals: GlobalBehaviorsOptions[],
  ): Provider {
    if (options.useFactory) {
      const factory = options.useFactory;
      return {
        provide: PIPELINE_MODULE_OPTIONS,
        useFactory: async (...args: never[]) =>
          withStaticGlobals(
            assertRuntimeOptions(await factory(...args), 'useFactory'),
            staticGlobals,
          ),
        inject: options.inject ?? [],
      };
    }
    const inject = [
      (options.useClass || options.useExisting) as Type<PipelineOptionsFactory>,
    ];
    return {
      provide: PIPELINE_MODULE_OPTIONS,
      useFactory: async (optionsFactory: PipelineOptionsFactory) =>
        withStaticGlobals(
          assertRuntimeOptions(
            await optionsFactory.createPipelineOptions(),
            `${optionsFactory.constructor.name}.createPipelineOptions()`,
          ),
          staticGlobals,
        ),
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
   * Use `{ imports, behaviors }` when behaviors inject dependencies exported
   * by other modules. Providers in the importing parent module are not visible
   * automatically. Runtime configuration remains owned by `forRoot()`.
   *
   * @example
   * ```ts
   * @Module({
   *   imports: [PipelineModule.forFeature([AuditBehavior])],
   * })
   * export class AuditLogModule {}
   * ```
   */
  static forFeature(
    options: Type<IPipelineBehavior>[] | PipelineModuleFeatureOptions,
  ): DynamicModule {
    const { behaviors, imports } = Array.isArray(options)
      ? { behaviors: options, imports: undefined }
      : options;

    const types = behaviors.map((behavior, index) =>
      behaviorEntryType(
        behavior,
        `PipelineModule.forFeature behaviors, entry ${index}`,
        false,
      ),
    );
    return {
      global: true,
      module: PipelineModule,
      ...(imports ? { imports } : {}),
      providers: types,
      exports: types,
    };
  }
}
