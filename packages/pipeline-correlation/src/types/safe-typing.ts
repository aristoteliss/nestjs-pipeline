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
