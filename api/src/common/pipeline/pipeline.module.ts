/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { type DynamicModule, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import {
  PIPELINE_OPTIONS,
  PipelineBootstrap,
  type PipelineOptions,
} from './pipeline.bootstrap.js';

/**
 * Runs the `@nestjs/cqrs` handlers through their `@cqrs-ddd/pipeline`
 * pipelines. It places the global behaviors and the context sources; the
 * behavior instances are providers of the modules that configure them, under
 * their behavior class.
 *
 * @example
 * ```ts
 * @Module({
 *   imports: [
 *     PipelineModule.forRoot({
 *       sources: contextSources,
 *       globalBehaviors: [{ scope: 'all', before: [logging()] }],
 *     }),
 *   ],
 *   providers: [
 *     { provide: LoggingBehavior, useFactory: () => new LoggingBehavior(new Logger('Pipeline')) },
 *   ],
 * })
 * export class ObservabilityModule {}
 * ```
 */
@Module({})
export class PipelineModule {
  static forRoot(options: PipelineOptions = {}): DynamicModule {
    return {
      module: PipelineModule,
      imports: [DiscoveryModule],
      providers: [
        { provide: PIPELINE_OPTIONS, useValue: options },
        PipelineBootstrap,
      ],
    };
  }
}
