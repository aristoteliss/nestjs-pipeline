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

import { DynamicModule, Global, Module, Type } from '@nestjs/common';
import { PipelineBehaviorEntry } from './decorators/pipeline.decorator';
import { IPipelineBehavior } from './interfaces/pipeline.behavior.interface';
import {
  PIPELINE_MODULE_OPTIONS,
  PipelineModuleOptions,
} from './options/pipeline-module.options';
import { PipelineBootstrapService } from './services/pipeline.bootstrap.service';

// Re-export so existing `from './pipeline.module'` imports keep working.
export {
  GlobalBehaviorScope,
  GlobalBehaviorsOptions,
  PIPELINE_MODULE_OPTIONS,
  PipelineModuleOptions,
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
 * // Simple — array of behaviors (backward-compatible)
 * PipelineModule.forRoot([LoggingBehavior, AuditBehavior])
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
 * import { getCorrelationId } from '@nestjs-pipeline/correlation';
 * PipelineModule.forRoot({
 *   behaviors: [LoggingBehavior],
 *   correlationIdFactory: getCorrelationId,
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
// biome-ignore lint/complexity/noStaticOnlyClass: This module only has static methods for configuration.
export class PipelineModule {
  static forRoot(
    optionsOrBehaviors: PipelineModuleOptions | Type<IPipelineBehavior>[] = [],
  ): DynamicModule {
    const options: PipelineModuleOptions = Array.isArray(optionsOrBehaviors)
      ? { behaviors: optionsOrBehaviors }
      : optionsOrBehaviors;

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
      ],
      exports: [...globalBehaviorTypes, ...behaviors],
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
