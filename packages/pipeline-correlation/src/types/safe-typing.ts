/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
