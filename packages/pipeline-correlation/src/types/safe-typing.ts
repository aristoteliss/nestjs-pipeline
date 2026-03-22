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

/**
 * Recursive dynamic type for deep chained property/method access on unknown
 *
 * Every property access and method call returns another `DynResult`, so
 * optional chains like `dyn(ctx)?.getMessage?.()?.properties?.correlationId`
 * compile without `any`.
 */
interface DynResult {
  [key: string | symbol]: DynResult;
  (...args: unknown[]): DynResult;
}

/** Cast unknown value to a recursively-callable dynamic type. */
export function dyn(value: unknown): DynResult | undefined {
  return value as DynResult | undefined;
}
