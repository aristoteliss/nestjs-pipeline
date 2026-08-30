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

import type { JsonValue } from '../interfaces/idempotency-record.interface';

/**
 * Converts a value to the portable JSON domain used for fingerprints and
 * idempotency response snapshots. Dates are the sole non-JSON value with an
 * explicit conversion; every other lossy JSON.stringify case is rejected.
 */
export function toStrictJsonValue(value: unknown, sortKeys = false): JsonValue {
  return normalize(value, new WeakSet<object>(), sortKeys);
}

function normalize(
  value: unknown,
  ancestors: WeakSet<object>,
  sortKeys: boolean,
): JsonValue {
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
      `${value.constructor.name || 'Object'} is outside the supported JSON domain.`,
    );
  }

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(
      'Symbol-keyed properties are outside the supported JSON domain.',
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

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const result: JsonValue[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new TypeError('Sparse arrays are not JSON-serializable.');
        }
        result.push(normalize(value[index], ancestors, sortKeys));
      }
      return result;
    }

    // CQRS requests and response DTOs are commonly class instances. Their own
    // enumerable string properties are treated as a JSON record, while native
    // collection/binary/error objects are rejected above.
    const source = value as Record<string, unknown>;
    const keys = Object.keys(source);
    if (sortKeys) keys.sort();

    const result: { [key: string]: JsonValue } = Object.create(null);
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
