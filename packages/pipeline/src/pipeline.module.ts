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

import { DynamicModule, Global, MiddlewareConsumer, Module, NestModule, Type } from '@nestjs/common';
import { HttpCorrelationMiddleware } from './correlation/http-correlation.middleware';
import { IPipelineBehavior } from './interfaces/pipeline.behavior.interface';
import { PipelineBehaviorEntry } from './decorators/pipeline.decorator';
import { PipelineBootstrapService } from './services/pipeline.bootstrap.service';
import { CorrelationOptions } from './options/correlation.options';
import { PIPELINE_MODULE_OPTIONS, PipelineModuleOptions } from './options/pipeline-module.options';

// Re-export so existing `from './pipeline.module'` imports keep working.
export {
  CorrelationOptions,
  GlobalBehaviorScope,
  GlobalBehaviorsOptions,
  PIPELINE_MODULE_OPTIONS,
  PipelineModuleOptions,
} from './options';

/**
 * Extracts the behavior class (Type) from each entry,
 * discarding inline options used by the tuple form.
 */
function extractBehaviorTypes(entries: PipelineBehaviorEntry[]): Type<IPipelineBehavior>[] {
  return entries.map((entry) => (Array.isArray(entry) ? entry[0] : entry));
}

/**
 * Import this module once in your AppModule (or CommonModule).
 *
 * @example
 * ```ts
 * // Simple — array of behaviors (backward-compatible, HTTP correlation by default)
 * PipelineModule.forRoot([LoggingBehavior, AuditBehavior])
 *
 * // Advanced — global behaviors + custom header
 * PipelineModule.forRoot({
 *   behaviors: [LoggingBehavior],
 *   globalBehaviors: { scope: 'all', before: [MetricsBehavior] },
 *   correlation: { header: 'x-request-id' },
 * })
 *
 * // Worker-only — no HTTP middleware
 * PipelineModule.forRoot({
 *   behaviors: [LoggingBehavior],
 *   correlation: { header: false },
 * })
 * ```
 *
 * Correlation ID resolution order (before any behavior runs):
 * 1. Parent pipeline context (saga / nested command)
 * 2. {@link correlationStore} — populated by {@link HttpCorrelationMiddleware}
 *    or {@link runWithCorrelationId} (Bull / RabbitMQ / custom)
 * 3. `uuidv7()` fallback (timestamp-sortable UUID)
 */
@Global()
@Module({})
export class PipelineModule implements NestModule {
  private static correlation: CorrelationOptions = {};

  configure(consumer: MiddlewareConsumer) {
    if (PipelineModule.correlation.header !== false) {
      consumer.apply(HttpCorrelationMiddleware).forRoutes('*');
    }
  }

  static forRoot(
    optionsOrBehaviors: PipelineModuleOptions | Type<IPipelineBehavior>[] = [],
  ): DynamicModule {
    const options: PipelineModuleOptions = Array.isArray(optionsOrBehaviors)
      ? { behaviors: optionsOrBehaviors }
      : optionsOrBehaviors;

    const behaviors = options.behaviors ?? [];

    // Extract global behavior types for DI registration (deduplicated against `behaviors`)
    const globalBehaviorTypes = extractBehaviorTypes([
      ...(options.globalBehaviors?.before ?? []),
      ...(options.globalBehaviors?.after ?? []),
    ]).filter((t) => !behaviors.includes(t));

    // Store for configure() — static because configure() runs on the class instance
    PipelineModule.correlation = options.correlation ?? {};

    return {
      module: PipelineModule,
      providers: [
        { provide: PIPELINE_MODULE_OPTIONS, useValue: options },
        PipelineBootstrapService,
        HttpCorrelationMiddleware,
        ...globalBehaviorTypes,
        ...behaviors,
      ],
      exports: [HttpCorrelationMiddleware, ...globalBehaviorTypes, ...behaviors],
    };
  }

  /**
   * Register pipeline behavior classes in a feature module.
   *
   * Use this in any module that owns behaviors referenced by
   * `@UsePipeline(...)` decorators. It makes the intent explicit
   * and provides a future-proof hook for validation or metadata.
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
      module: PipelineModule,
      providers: [...behaviors],
      exports: [...behaviors],
    };
  }
}
