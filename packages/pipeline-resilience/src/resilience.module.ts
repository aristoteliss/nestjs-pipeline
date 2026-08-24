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

import { type DynamicModule, Module } from '@nestjs/common';
import { RESILIENCE_DEFAULT_OPTIONS } from './constants/tokens';
import type { ResilienceBehaviorOptions } from './interfaces/resilience-options.interface';
import { ResilienceBehavior } from './resilience.behavior';

/**
 * NestJS module that registers the {@link ResilienceBehavior} and (optionally)
 * application-wide default {@link ResilienceBehaviorOptions}.
 *
 * Attach the behavior either globally through `PipelineModule` or per handler
 * via `@UsePipeline`.
 *
 * @example Global defaults + global behavior
 * ```ts
 * import { ResilienceModule, ResilienceBehavior } from '@nestjs-pipeline/resilience';
 *
 * @Module({
 *   imports: [
 *     ResilienceModule.forRoot({
 *       // Sensible defaults applied to every handler unless overridden
 *       timeout: { duration: 5_000 },
 *       retry: { maxAttempts: 3, backoff: { type: 'exponential' } },
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
 *   retry: { maxAttempts: 3, backoff: { type: 'exponential' } },
 *   circuitBreaker: { halfOpenAfter: 10_000, breaker: { type: 'consecutive', threshold: 5 } },
 * }])
 * export class ChargeCardHandler implements ICommandHandler<ChargeCardCommand> {}
 * ```
 */
@Module({})
export class ResilienceModule {
  /**
   * Registers the resilience behavior and optional application-wide defaults.
   *
   * @param defaultOptions - Defaults merged under every handler's options.
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
