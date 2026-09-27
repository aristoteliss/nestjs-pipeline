/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * Type-safe replacement for `as any` when accessing dynamic or undeclared properties.
 *
 * Returns the original type intersected with a string+symbol index signature,
 * so property reads are `unknown` instead of `any`. This satisfies Biome's
 * `noExplicitAny` without suppressing the rule.
 *
 * @example
 * const scope = untyped(wrapper).scope; // unknown
 */
export function untyped<T>(value: T): T & Record<string | symbol, unknown> {
  return value as T & Record<string | symbol, unknown>;
}
