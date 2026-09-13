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
 * Resolves a stable OpenFeature targeting key from the current pipeline request.
 *
 * For percentage rollouts this should normally be a user, account, tenant or
 * device identifier that stays stable across requests. A correlation ID is
 * usually a poor rollout key because it changes per request.
 */
export type TargetingKeyFactory = (
  context: IPipelineContext,
) => string | undefined;

/**
 * Returns a fallback value to emit when the gating flag is disabled, instead of
 * throwing {@link FeatureDisabledError}. Receives the pipeline context so the
 * fallback can be request-aware.
 */
export type FeatureFallbackFactory = (
  context: IPipelineContext,
) => unknown | Promise<unknown>;

/** Controls how OpenFeature provider evaluation failures are handled. */
export type FeatureFlagErrorPolicy = 'use-default' | 'throw';

/**
 * Detailed result of a feature-flag evaluation, recorded on the pipeline
 * context so logging/audit/telemetry or later behaviors can inspect the exact
 * provider decision without re-evaluating the flag.
 */
export interface FeatureFlagDecision {
  /** Evaluated OpenFeature flag key. */
  flagKey: string;
  /** Raw boolean value returned by OpenFeature (or its configured default value). */
  value: boolean;
  /** Final gate decision after optional variant filtering. */
  enabled: boolean;
  /** Provider-selected variant, when the provider reports one. */
  variant?: string;
  /** OpenFeature resolution reason, when reported by the provider. */
  reason?: string;
  /** OpenFeature provider error code, if evaluation failed. */
  errorCode?: string;
  /** Provider error message, if evaluation failed. */
  errorMessage?: string;
  /** Stable targeting key used for this evaluation, if one was supplied. */
  targetingKey?: string;
}

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
   *
   * @example
   * ```ts
   * @UsePipeline([FeatureFlagBehavior, {
   *   flag: 'new-checkout',
   *   context: (ctx) => ({
   *     plan: ctx.items.get('plan') as string,
   *     country: ctx.items.get('country') as string,
   *   }),
   * }])
   * ```
   */
  context?: EvaluationContextFactory;

  /**
   * Stable identity used for percentage rollouts / sticky targeting.
   *
   * Handler-level `targetingKeyFactory` overrides the module-level resolver.
   * Correlation IDs are intentionally **not** used automatically because they
   * normally change on every request and can move the same user between rollout
   * cohorts.
   *
   * @example User-sticky rollout
   * ```ts
   * @UsePipeline([FeatureFlagBehavior, {
   *   flag: 'new-checkout',
   *   targetingKeyFactory: (ctx) =>
   *     ctx.items.get('userId') as string | undefined,
   * }])
   * ```
   */
  targetingKeyFactory?: TargetingKeyFactory;

  /**
   * Optional allow-list of provider variants. When set, a boolean `true` only
   * enables the handler if the provider also resolved one of these variants.
   *
   * This is useful when one boolean flag carries named cohorts such as
   * `control`, `treatment-a`, and `treatment-b`.
   *
   * @example
   * ```ts
   * @UsePipeline([FeatureFlagBehavior, {
   *   flag: 'checkout-experiment',
   *   allowedVariants: ['treatment-a'],
   * }])
   * ```
   */
  allowedVariants?: readonly string[];

  /**
   * Provider evaluation-error handling.
   *
   * - `use-default` — follow OpenFeature's default-value semantics and continue
   *   evaluating the final gate using `defaultValue` (default).
   * - `throw` — surface {@link FeatureFlagEvaluationError} instead of silently
   *   treating a provider failure like an ordinary disabled flag.
   *
   * @default 'use-default'
   */
  errorPolicy?: FeatureFlagErrorPolicy;
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
   * `{ environment: 'prod', service: 'order-service' }`).
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

  /**
   * Application-wide stable rollout identity resolver. Prefer a user, account,
   * tenant, or device identifier that survives across requests. A handler may
   * override this with its own {@link FeatureFlagBehaviorOptions.targetingKeyFactory}.
   *
   * @example
   * ```ts
   * FeatureFlagsModule.forRoot({
   *   provider: myProvider,
   *   targetingKeyFactory: (ctx) =>
   *     ctx.items.get('accountId') as string | undefined,
   * });
   * ```
   */
  targetingKeyFactory?: TargetingKeyFactory;
}
