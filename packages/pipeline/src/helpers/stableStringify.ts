/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * A strictly JSON-serializable value (primitives, arrays, and plain records).
 */
export type StrictJsonValue =
  | null
  | boolean
  | number
  | string
  | StrictJsonValue[]
  | { [key: string]: StrictJsonValue };

/**
 * Normalizes a value to the strict, portable JSON domain used for deterministic
 * hashing, idempotency fingerprints, and cache key generation.
 *
 * Enforces strict JSON boundaries:
 * - Primitives (`string`, `boolean`, `null`, finite `number`) are preserved.
 * - Dates are explicitly converted to ISO-8601 strings (`.toISOString()`).
 * - Custom objects with `.toJSON()` methods are validated through their returned
 *   representation; internal fields excluded by that method are not inspected.
 * - Object keys are optionally sorted recursively for deterministic serialization.
 * - Unsupported types (non-finite numbers, `Map`, `Set`, `Error`, `RegExp`,
 *   binary buffers, promises, symbols, and sparse arrays) throw a {@link TypeError}.
 * - Cyclic references are detected via a `WeakSet` and throw a {@link TypeError}.
 *
 * @param value The value to normalize.
 * @param sortKeys Whether to sort object keys recursively in lexicographical order.
 * @returns The strictly normalized JSON-compatible value.
 * @throws {TypeError} If the value contains cycles or elements outside the JSON domain.
 *
 * @example
 * ```ts
 * const normalized = toStrictJsonValue({ b: 2, a: 1 }, true);
 * // → { a: 1, b: 2 }
 * ```
 */
export function toStrictJsonValue(
  value: unknown,
  sortKeys = false,
): StrictJsonValue {
  return normalize(value, new WeakSet<object>(), sortKeys);
}

function normalize(
  value: unknown,
  ancestors: WeakSet<object>,
  sortKeys: boolean,
): StrictJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Non-finite numbers are not JSON-serializable.');
    }
    return value;
  }

  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported JSON value type: ${typeof value}.`);
  }

  if (ancestors.has(value)) {
    throw new TypeError('Cyclic values are not JSON-serializable.');
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new TypeError('Invalid dates are not JSON-serializable.');
    }
    return value.toISOString();
  }

  if (isUnsupportedObject(value)) {
    throw new TypeError(
      `${value.constructor?.name || 'Object'} is outside the supported JSON domain.`,
    );
  }

  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') {
    ancestors.add(value);
    try {
      return normalize(toJSON.call(value), ancestors, sortKeys);
    } finally {
      ancestors.delete(value);
    }
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(
      'Symbol-keyed properties are outside the supported JSON domain.',
    );
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: StrictJsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new TypeError('Sparse arrays are not JSON-serializable.');
        }
        result.push(normalize(value[index], ancestors, sortKeys));
      }
      return result;
    }

    const source = value as Record<string, unknown>;
    const keys = Object.keys(source);
    if (sortKeys) keys.sort();

    const result: { [key: string]: StrictJsonValue } = Object.create(null);
    for (const key of keys) {
      result[key] = normalize(source[key], ancestors, sortKeys);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function isUnsupportedObject(value: object): boolean {
  return (
    value instanceof RegExp ||
    value instanceof Error ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof WeakMap ||
    value instanceof WeakSet ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value) ||
    value instanceof Promise
  );
}

/**
 * Deterministically serializes a value to a JSON string with lexicographically
 * sorted object keys.
 *
 * Guarantees that structurally equal payloads produce byte-identical JSON strings
 * regardless of property insertion order.
 *
 * @param value The value to serialize.
 * @returns The deterministic JSON string representation.
 * @throws {TypeError} If the value is cyclic, contains non-serializable types, or cannot be represented in JSON.
 *
 * @example
 * ```ts
 * stableStringify({ z: 1, a: 2 });
 * // → '{"a":2,"z":1}'
 * ```
 */
export function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(toStrictJsonValue(value, true));
  } catch (cause) {
    // `toStrictJsonValue` reports precisely what went wrong — a cycle, a
    // symbol-keyed property, a Map, a non-finite number. Discarding that left an
    // operator with a generic message and no way to tell which field or which
    // constraint broke, on a function that underpins cache keys, idempotency
    // fingerprints and repository key derivation.
    throw new TypeError(
      'stableStringify requires an acyclic JSON-serializable value.',
      { cause },
    );
  }
}
