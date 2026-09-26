/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type DynamicModule,
  Module,
  type ModuleMetadata,
  type Provider,
} from '@nestjs/common';
import {
  getResiliencePolicyToken,
  RESILIENCE_DEFAULT_OPTIONS,
  RESILIENCE_MODULE_OPTIONS,
  RESILIENCE_POLICY_OPTIONS,
} from './constants/tokens';
import type {
  ResilienceModuleAsyncOptions,
  ResilienceModuleOptions,
} from './interfaces/resilience-options.interface';
import { ResilienceBehavior } from './resilience.behavior';
import { ResiliencePolicies } from './resilience-policies';

/**
 * NestJS module that registers the {@link ResilienceBehavior}, its optional
 * application-wide defaults, and the named policies of outbound dependencies
 * ({@link ResiliencePolicies}).
 *
 * Attach the behavior either globally through `PipelineModule` or per handler
 * via `@UsePipeline`. Registering this module alone does not wrap handlers.
 *
 * @example Named policy for an outbound dependency, and handler defaults
 * ```ts
 * import { ResilienceModule, ResilienceBehavior } from '@nestjs-pipeline/resilience';
 *
 * @Module({
 *   imports: [
 *     ResilienceModule.forRoot({
 *       defaults: { timeout: { duration: 5_000, strategy: 'cooperative' } },
 *       policies: {
 *         paymentsApi: {
 *           handle: (error) => error instanceof PaymentGatewayUnavailableError,
 *           retry: { maxAttempts: 2, backoff: { type: 'exponential' } },
 *           circuitBreaker: {
 *             halfOpenAfter: 30_000,
 *             breaker: { type: 'consecutive', threshold: 5 },
 *           },
 *         },
 *       },
 *     }),
 *     PipelineModule.forRoot({ behaviors: [ResilienceBehavior] }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class ResilienceModule {
  /**
   * Registers the behavior, its defaults, and the named policies. Each named
   * policy is also injectable with `@InjectResiliencePolicy(name)`.
   *
   * @param options - Behavior defaults and named policies; both optional.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRoot(options: ResilienceModuleOptions = {}): DynamicModule {
    return ResilienceModule.create(
      { provide: RESILIENCE_MODULE_OPTIONS, useValue: options },
      [],
      Object.keys(options.policies ?? {}),
    );
  }

  /**
   * Registers the behavior and named policies from injected dependencies, such
   * as configuration. Only the names in `policyNames` are injectable with
   * `@InjectResiliencePolicy(name)`; every policy is available through
   * {@link ResiliencePolicies}.
   *
   * @param options - The factory, its injected providers and imports, and the injectable names.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRootAsync(options: ResilienceModuleAsyncOptions): DynamicModule {
    return ResilienceModule.create(
      {
        provide: RESILIENCE_MODULE_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      options.imports ?? [],
      options.policyNames ?? [],
    );
  }

  private static create(
    moduleOptions: Provider,
    imports: NonNullable<ModuleMetadata['imports']>,
    policyNames: readonly string[],
  ): DynamicModule {
    const namedPolicies = policyNames.map((name) => ({
      provide: getResiliencePolicyToken(name),
      useFactory: (policies: ResiliencePolicies) => policies.get(name),
      inject: [ResiliencePolicies],
    }));

    return {
      module: ResilienceModule,
      global: true,
      imports,
      providers: [
        moduleOptions,
        {
          provide: RESILIENCE_DEFAULT_OPTIONS,
          useFactory: (resolved: ResilienceModuleOptions) => resolved.defaults,
          inject: [RESILIENCE_MODULE_OPTIONS],
        },
        {
          provide: RESILIENCE_POLICY_OPTIONS,
          useFactory: (resolved: ResilienceModuleOptions) =>
            resolved.policies ?? {},
          inject: [RESILIENCE_MODULE_OPTIONS],
        },
        ResilienceBehavior,
        ResiliencePolicies,
        ...namedPolicies,
      ],
      exports: [
        ResilienceBehavior,
        ResiliencePolicies,
        RESILIENCE_DEFAULT_OPTIONS,
        ...namedPolicies.map((provider) => provider.provide),
      ],
    };
  }
}
