/**
 * Type-safe replacement for `as any` when accessing dynamic or undeclared properties.
 *
 * Returns the original type intersected with a string+symbol index signature,
 * so property reads are `unknown` instead of `any`. This satisfies Biome's
 * `noExplicitAny` without suppressing the rule.
 *
 * @example
 * // Before:  (wrapper as any).scope
 * // After:   untyped(wrapper).scope
 */
export function untyped<T>(value: T): T & Record<string | symbol, unknown> {
  return value as T & Record<string | symbol, unknown>;
}
