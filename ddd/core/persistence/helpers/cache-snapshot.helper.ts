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
 * Extracts a detached, serializable snapshot from a domain entity, aggregate root,
 * or arbitrary value before storing in cache or performing version comparisons.
 *
 * Serialization precedence:
 * 1. Explicit `serializeFn`: Custom transformer passed by caller/decorator.
 * 2. `value.toJSON()`: If the object provides a `toJSON()` method (e.g. `RootEntity.toJSON()`).
 * 3. Deep JSON clone (`JSON.parse(JSON.stringify(value))`): Clones plain objects and strips
 *    live class references/methods if no `toJSON` exists, guaranteeing isolation parity.
 * 4. Primitive / nullish pass-through: Returns primitives and null/undefined as-is.
 *
 * @example Extracting snapshot from domain entity with toJSON
 * ```typescript
 * const snapshot = toCacheSnapshot(user);
 * // Returns plain UserSnapshot object
 * ```
 *
 * @example Custom serializer function
 * ```typescript
 * const snapshot = toCacheSnapshot(user, (u) => ({ id: u.id, custom: true }));
 * ```
 *
 * @param value - The entity or value to snapshot.
 * @param serializeFn - Optional custom serialization function.
 * @returns Pure, detached serializable snapshot.
 */
export function toCacheSnapshot<T>(
  value: T,
  serializeFn?: ((value: T) => unknown) | null,
): unknown {
  if (serializeFn) {
    return serializeFn(value);
  }

  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { toJSON?: unknown }).toJSON === 'function'
  ) {
    return (value as unknown as { toJSON(): unknown }).toJSON();
  }

  if (value !== null && typeof value === 'object') {
    return JSON.parse(JSON.stringify(value));
  }

  return value;
}
