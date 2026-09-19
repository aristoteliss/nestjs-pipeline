/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type DynamicModule, Module } from '@nestjs/common';
import { RESILIENCE_DEFAULT_OPTIONS } from './constants/tokens';
import type { ResilienceBehaviorOptions } from './interfaces/resilience-options.interface';
import { ResilienceBehavior } from './resilience.behavior';

/**
 * NestJS module that registers the {@link ResilienceBehavior} and (optionally)
 * application-wide default {@link ResilienceBehaviorOptions} used wherever the
 * behavior is attached.
 *
 * Attach the behavior either globally through `PipelineModule` or per handler
 * via `@UsePipeline`. Registering this module alone does not wrap handlers.
 *
 * @example Global defaults + global behavior
 * ```ts
 * import { ResilienceModule, ResilienceBehavior } from '@nestjs-pipeline/resilience';
 *
 * @Module({
 *   imports: [
 *     ResilienceModule.forRoot({
 *       timeout: { duration: 5_000 },
 *     }),
 *     PipelineModule.forRoot({
 *       globalBehaviors: { scope: 'all', after: [ResilienceBehavior] },
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 *
 * @example No defaults — per-handler configuration only
 * ```ts
 * @Module({
 *   imports: [
 *     ResilienceModule.forRoot(),
 *     PipelineModule.forRoot({ behaviors: [ResilienceBehavior] }),
 *   ],
 * })
 * export class AppModule {}
 *
 * @CommandHandler(ChargeCardCommand)
 * @UsePipeline([ResilienceBehavior, {
 *   retry: {
 *     maxAttempts: 3,
 *     replaySafe: true,
 *     backoff: { type: 'exponential' },
 *   },
 *   circuitBreaker: {
 *     halfOpenAfter: 10_000,
 *     breaker: { type: 'consecutive', threshold: 5 },
 *   },
 *   handle: (error) => error instanceof TransientPaymentError,
 * }])
 * export class ChargeCardHandler implements ICommandHandler<ChargeCardCommand> {}
 * ```
 */
@Module({})
export class ResilienceModule {
  /**
   * Registers the resilience behavior and optional application-wide defaults.
   *
   * @param defaultOptions - Defaults merged under per-handler options whenever `ResilienceBehavior` executes.
   * @returns The configured global {@link DynamicModule}.
   */
  static forRoot(defaultOptions?: ResilienceBehaviorOptions): DynamicModule {
    return {
      module: ResilienceModule,
      global: true,
      providers: [
        ResilienceBehavior,
        {
          provide: RESILIENCE_DEFAULT_OPTIONS,
          useValue: defaultOptions,
        },
      ],
      exports: [ResilienceBehavior, RESILIENCE_DEFAULT_OPTIONS],
    };
  }
}
