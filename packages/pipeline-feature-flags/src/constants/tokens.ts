/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Injection token holding the OpenFeature {@link import('@openfeature/server-sdk').Client}
 * used to evaluate flags, built by {@link FeatureFlagsModule.forRoot}.
 */
export const FEATURE_FLAGS_CLIENT = Symbol('FEATURE_FLAGS_CLIENT');

/**
 * Injection token holding the module-wide default {@link FeatureFlagBehaviorOptions}
 * merged into every handler's per-pipeline configuration.
 */
export const FEATURE_FLAGS_DEFAULT_OPTIONS = Symbol(
  'FEATURE_FLAGS_DEFAULT_OPTIONS',
);

/**
 * Injection token holding the module-wide default OpenFeature
 * {@link import('@openfeature/server-sdk').EvaluationContext} merged into every
 * evaluation (e.g. environment, region, service name).
 */
export const FEATURE_FLAGS_DEFAULT_CONTEXT = Symbol(
  'FEATURE_FLAGS_DEFAULT_CONTEXT',
);

/**
 * Injection token holding the module-wide stable targeting-key resolver used
 * for percentage rollouts / sticky targeting. Applications typically return a
 * user, account, device, or tenant identifier from this factory.
 */
export const FEATURE_FLAGS_TARGETING_KEY_FACTORY = Symbol(
  'FEATURE_FLAGS_TARGETING_KEY_FACTORY',
);
