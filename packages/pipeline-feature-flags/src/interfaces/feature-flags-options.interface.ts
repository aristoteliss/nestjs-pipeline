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

import type { IPipelineContext } from '@nestjs-pipeline/core';
import type {
  Client,
  EvaluationContext,
  Provider,
} from '@openfeature/server-sdk';

/**
 * Builds an OpenFeature {@link EvaluationContext} from the current pipeline
 * request — letting flag targeting rules key off the live request/handler.
 */
export type EvaluationContextFactory = (
  context: IPipelineContext,
) => EvaluationContext;

/**
 * Returns a fallback value to emit when the gating flag is disabled, instead of
 * throwing {@link FeatureDisabledError}. Receives the pipeline context so the
 * fallback can be request-aware.
 */
export type FeatureFallbackFactory = (
  context: IPipelineContext,
) => unknown | Promise<unknown>;

/**
 * Per-handler feature-flag options, supplied through
 * `@UsePipeline([FeatureFlagBehavior, options])` and/or as module-wide defaults
 * via {@link FeatureFlagsModuleOptions.defaults}.
 */
export interface FeatureFlagBehaviorOptions {
  /**
   * Boolean flag key that gates the handler. When omitted the behavior is a
   * no-op (the handler always runs) — useful for setting only module defaults.
   */
  flag?: string;
  /**
   * Value used when the flag cannot be resolved (provider error, unknown key,
   * not yet ready). Defaults to `false` (fail-closed).
   */
  defaultValue?: boolean;
  /**
   * When the flag resolves to disabled, return this value instead of throwing
   * {@link FeatureDisabledError}. Use it to degrade gracefully (e.g. an empty
   * list or a "legacy" code path).
   */
  fallback?: FeatureFallbackFactory;
  /**
   * Builds extra OpenFeature targeting context for this handler, merged on top
   * of the base context (derived from the request) and the module-wide context.
   */
  context?: EvaluationContextFactory;
}

/**
 * Options accepted by {@link FeatureFlagsModule.forRoot}.
 *
 * The OpenFeature client can be provided in three ways (checked in order):
 * a pre-built `client`, a `provider` instance the module will register, or
 * neither — in which case the ambient OpenFeature default client is used (you
 * register a provider elsewhere via `OpenFeature.setProvider(...)`).
 */
export interface FeatureFlagsModuleOptions {
  /**
   * Escape hatch: a fully constructed OpenFeature {@link Client}. Takes
   * precedence over {@link provider}.
   */
  client?: Client;
  /**
   * An OpenFeature {@link Provider} to register on startup — e.g. an Unleash or
   * Flagsmith provider. The module calls `setProviderAndWait` (or `setProvider`
   * when {@link waitForReady} is `false`) before resolving the client.
   */
  provider?: Provider;
  /**
   * OpenFeature domain (named client) to bind the provider/client to. Lets you
   * run multiple providers side by side. Defaults to the unnamed default client.
   */
  domain?: string;
  /**
   * Static targeting context merged into every evaluation (e.g.
   * `{ environment: 'prod', service: 'users-api' }`).
   */
  context?: EvaluationContext;
  /**
   * Whether to await provider readiness via `setProviderAndWait` before the app
   * finishes bootstrapping. Defaults to `true`. Ignored when {@link client} is
   * supplied.
   */
  waitForReady?: boolean;
  /** Default per-handler behavior options merged into every pipeline. */
  defaults?: FeatureFlagBehaviorOptions;
}
