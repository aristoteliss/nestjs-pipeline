/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Injection token holding the shared `cache-manager` {@link import('cache-manager').Cache}
 * instance built by {@link CacheModule.forRoot}.
 */
export const PIPELINE_CACHE = Symbol('PIPELINE_CACHE');

/**
 * Injection token holding the module-wide default {@link CacheBehaviorOptions}
 * merged into every handler's per-pipeline configuration.
 */
export const CACHE_DEFAULT_OPTIONS = Symbol('CACHE_DEFAULT_OPTIONS');
