/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Injectable } from '@nestjs/common';
import type {
  IPipelineBehavior,
  IPipelineContext,
  NextDelegate,
} from '@nestjs-pipeline/core';
import type { Attributes } from '@opentelemetry/api';
import {
  addPipelineTelemetryAttributes,
  type PipelineTelemetryAttributeFactory,
  withFactoryAttributes,
} from './telemetry-attributes.js';

/** Options for {@link AttributesBehavior}. */
export interface AttributesBehaviorOptions {
  /**
   * Evaluated in order once the rest of the chain has finished, successfully
   * or not; later factories win on a shared attribute name. A factory that
   * throws or rejects contributes nothing, and the others still apply.
   */
  factories?: readonly PipelineTelemetryAttributeFactory[];
}

/**
 * Collects attributes that describe what the rest of the chain decided, and
 * adds them to the execution's attribute bag, which `TraceBehavior` applies to
 * its span and `MetricsBehavior` to its labels when `includeContextAttributes`
 * is on.
 *
 * Behaviors that take no telemetry dependency publish their decisions as
 * `context.items` entries and export a factory that reads them, such as
 * `buildCacheAttributes` of `@nestjs-pipeline/cache`. This behavior runs those
 * factories after the chain unwinds, so every inner behavior has published its
 * item by then. The application chooses the factories, can wrap one to rename
 * or drop attributes, and can register the behavior globally or per handler.
 *
 * Register it inside `TraceBehavior` and `MetricsBehavior` and outside the
 * behaviors it describes. It never changes the outcome: the result or error
 * of the chain is returned as it was.
 *
 * @example
 * ```ts
 * PipelineModule.forRoot({
 *   globalBehaviors: {
 *     before: [
 *       TraceBehavior,
 *       [AttributesBehavior, {
 *         factories: [buildCacheAttributes, buildIdempotencyAttributes],
 *       }],
 *     ],
 *   },
 * });
 * ```
 */
@Injectable()
export class AttributesBehavior implements IPipelineBehavior {
  async handle(context: IPipelineContext, next: NextDelegate) {
    try {
      return await next();
    } finally {
      await this.collect(context);
    }
  }

  private async collect(context: IPipelineContext): Promise<void> {
    try {
      const factories =
        context.getBehaviorOptions<AttributesBehaviorOptions>(
          AttributesBehavior,
        )?.factories ?? [];
      let attributes: Attributes = {};
      for (const factory of factories) {
        attributes = await withFactoryAttributes(attributes, factory, context);
      }
      addPipelineTelemetryAttributes(context, attributes);
    } catch {
      // Telemetry must never change the outcome of the request.
    }
  }
}
