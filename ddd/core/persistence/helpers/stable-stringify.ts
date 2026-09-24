/* Copyright (C) 2026-present Aristotelis — see repository license. */

/**
 * A strictly JSON-serializable value (primitives, arrays, and plain records).
 */
type StrictJsonValue =
  | null
  | boolean
  | number
  | string
  | StrictJsonValue[]
  | { [key: string]: StrictJsonValue };

function normalize(
  value: unknown,
  ancestors: WeakSet<object>,
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
      return normalize(toJSON.call(value), ancestors);
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
        result.push(normalize(value[index], ancestors));
      }
      return result;
    }

    const source = value as Record<string, unknown>;
    const keys = Object.keys(source).sort();

    const result: { [key: string]: StrictJsonValue } = Object.create(null);
    for (const key of keys) {
      result[key] = normalize(source[key], ancestors);
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
 * sorted object keys, for cache key derivation.
 *
 * Guarantees that structurally equal payloads produce byte-identical JSON strings
 * regardless of property insertion order. The output forms cache keys, so it must
 * never change: the golden spec pins it, and it matches `stableStringify` from
 * `@nestjs-pipeline/core` byte for byte.
 *
 * Enforces strict JSON boundaries:
 * - Primitives (`string`, `boolean`, `null`, finite `number`) are preserved.
 * - Dates are explicitly converted to ISO-8601 strings (`.toISOString()`).
 * - Custom objects with `.toJSON()` methods are validated through their returned
 *   representation; internal fields excluded by that method are not inspected.
 * - Object keys are sorted recursively.
 * - Unsupported types (`undefined`, `bigint`, symbols, functions, non-finite
 *   numbers, `Map`, `Set`, `Error`, `RegExp`, binary buffers, promises,
 *   symbol-keyed properties and sparse arrays) throw a {@link TypeError}.
 * - Cyclic references are detected via a `WeakSet` and throw a {@link TypeError}.
 *
 * @param value The value to serialize.
 * @returns The deterministic JSON string representation.
 * @throws {TypeError} If the value is cyclic, contains non-serializable types, or
 *   cannot be represented in JSON. The precise reason is the error's `cause`.
 *
 * @example
 * ```ts
 * stableStringify({ z: 1, a: 2 });
 * // → '{"a":2,"z":1}'
 * ```
 */
export function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(normalize(value, new WeakSet<object>()));
  } catch (cause) {
    // Preserve the precise normalization failure as the cause.
    throw new TypeError(
      'stableStringify requires an acyclic JSON-serializable value.',
      { cause },
    );
  }
}
