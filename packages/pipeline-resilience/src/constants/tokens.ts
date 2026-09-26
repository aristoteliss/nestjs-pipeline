/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * DI token holding the application-wide default {@link ResilienceBehaviorOptions}.
 *
 * Bound by {@link ResilienceModule.forRoot}. The {@link ResilienceBehavior}
 * injects it `@Optional()`-ly and merges these defaults with any per-handler
 * options supplied via `@UsePipeline([ResilienceBehavior, { ... }])`.
 */
export const RESILIENCE_DEFAULT_OPTIONS = Symbol('RESILIENCE_DEFAULT_OPTIONS');

/** DI token holding the whole options object of `forRoot` or `forRootAsync`. */
export const RESILIENCE_MODULE_OPTIONS = Symbol('RESILIENCE_MODULE_OPTIONS');

/**
 * DI token holding the named policy options, `Record<string, ResiliencePolicyOptions>`,
 * that {@link ResiliencePolicies} builds at startup.
 */
export const RESILIENCE_POLICY_OPTIONS = Symbol('RESILIENCE_POLICY_OPTIONS');

/**
 * DI token of one named policy, the one `@InjectResiliencePolicy(name)` injects.
 *
 * @param name - The policy name declared in `ResilienceModule.forRoot({ policies })`.
 */
export function getResiliencePolicyToken(name: string): string {
  return `ResiliencePolicy:${name}`;
}
