/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * DI token holding the application-wide default {@link ResilienceBehaviorOptions}.
 *
 * Bound by {@link ResilienceModule.forRoot}. The {@link ResilienceBehavior}
 * injects it `@Optional()`-ly and merges these defaults with any per-handler
 * options supplied via `@UsePipeline([ResilienceBehavior, { ... }])`.
 */
export const RESILIENCE_DEFAULT_OPTIONS = Symbol('RESILIENCE_DEFAULT_OPTIONS');
