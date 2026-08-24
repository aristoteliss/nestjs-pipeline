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

import {
  Inject,
  Injectable,
  Logger,
  type LoggerService,
  Optional,
} from '@nestjs/common';
import {
  type IPipelineBehavior,
  type IPipelineContext,
  LOGGING_BEHAVIOR_LOGGER,
  type NextDelegate,
  untyped,
} from '@nestjs-pipeline/core';
import type { Client, EvaluationContext } from '@openfeature/server-sdk';
import {
  FEATURE_FLAGS_CLIENT,
  FEATURE_FLAGS_DEFAULT_CONTEXT,
  FEATURE_FLAGS_DEFAULT_OPTIONS,
} from './constants/tokens';
import { FeatureDisabledError } from './errors/feature-disabled.error';
import { buildEvaluationContext } from './helpers/evaluation-context';
import type { FeatureFlagBehaviorOptions } from './interfaces/feature-flags-options.interface';

/** Item key set on the pipeline context recording the resolved flag value. */
export const FEATURE_FLAG_ITEM = 'feature-flag.enabled';
/** Item key set on the pipeline context recording the evaluated flag key. */
export const FEATURE_FLAG_KEY_ITEM = 'feature-flag.key';

/**
 * Pipeline behavior that gates a handler behind an OpenFeature boolean flag.
 *
 * Provider-agnostic by design: it talks only to the OpenFeature {@link Client},
 * so the backing provider (Unleash, Flagsmith, LaunchDarkly, a local file, …) is
 * a drop-in swap configured once in {@link FeatureFlagsModule.forRoot}.
 *
 * Resolution of the effective options for a handler:
 * 1. Application-wide defaults bound to {@link FEATURE_FLAGS_DEFAULT_OPTIONS}
 *    (via {@link FeatureFlagsModule.forRoot}).
 * 2. Per-handler options from `@UsePipeline([FeatureFlagBehavior, { ... }])`,
 *    shallow-merged on top of the defaults (handler keys win).
 *
 * Behavior:
 * - No `flag` configured → pass through (the handler always runs).
 * - Flag **enabled** → run the handler.
 * - Flag **disabled** → return `fallback(context)` if provided, otherwise throw
 *   {@link FeatureDisabledError}.
 *
 * Evaluation is **fail-closed**: if the provider errors or the key is unknown,
 * the configured `defaultValue` (default `false`) is used.
 */
@Injectable()
export class FeatureFlagBehavior implements IPipelineBehavior {
  private readonly logger: LoggerService;
  private readonly defaults: FeatureFlagBehaviorOptions;

  constructor(
    @Inject(FEATURE_FLAGS_CLIENT)
    private readonly client: Client,
    @Optional()
    @Inject(FEATURE_FLAGS_DEFAULT_OPTIONS)
    defaults?: FeatureFlagBehaviorOptions,
    @Optional()
    @Inject(FEATURE_FLAGS_DEFAULT_CONTEXT)
    private readonly moduleContext?: EvaluationContext,
    @Optional()
    @Inject(LOGGING_BEHAVIOR_LOGGER)
    logger?: LoggerService,
  ) {
    this.defaults = defaults ?? {};

    if (!logger) {
      this.logger = new Logger(FeatureFlagBehavior.name, { timestamp: true });
      return;
    }

    this.logger = logger;
    if (typeof untyped(this.logger).setContext === 'function') {
      (
        this.logger as LoggerService & { setContext(context: string): void }
      ).setContext(FeatureFlagBehavior.name);
    }
  }

  async handle(
    context: IPipelineContext,
    next: NextDelegate,
  ): Promise<unknown> {
    const options = this.resolveOptions(context);

    // No flag to gate on — behave as a transparent pass-through.
    if (!options.flag) return next();

    const evalContext = buildEvaluationContext(
      context,
      this.moduleContext,
      options.context,
    );

    const enabled = await this.client.getBooleanValue(
      options.flag,
      options.defaultValue ?? false,
      evalContext,
    );

    context.items.set(FEATURE_FLAG_KEY_ITEM, options.flag);
    context.items.set(FEATURE_FLAG_ITEM, enabled);

    if (enabled) {
      this.logger.debug?.(
        `Feature "${options.flag}" enabled for ${context.requestName}`,
      );
      return next();
    }

    this.logger.debug?.(
      `Feature "${options.flag}" disabled for ${context.requestName}`,
    );

    if (options.fallback) {
      return options.fallback(context);
    }

    throw new FeatureDisabledError(options.flag, context.requestName);
  }

  /** Shallow-merges per-handler options over the application defaults. */
  private resolveOptions(
    context: IPipelineContext,
  ): FeatureFlagBehaviorOptions {
    const handlerOptions =
      context.getBehaviorOptions<FeatureFlagBehaviorOptions>(
        FeatureFlagBehavior,
      );
    if (!handlerOptions) return this.defaults;
    return { ...this.defaults, ...handlerOptions };
  }
}
