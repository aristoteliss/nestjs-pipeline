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
