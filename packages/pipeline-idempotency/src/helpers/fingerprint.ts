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

import { createHash } from 'node:crypto';

/**
 * Produces a stable SHA-256 hex digest of an acyclic JSON-serializable value,
 * with object keys sorted so semantically-equal payloads hash identically
 * regardless of property order. Used to detect an idempotency key being reused
 * with a different body.
 */
export function fingerprintValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/**
 * `JSON.stringify` with deterministically ordered object keys. Unsupported
 * values fail with a deliberate TypeError instead of returning `undefined` or
 * overflowing while traversing a cycle.
 */
export function stableStringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(normalize(value, new WeakSet()));
    if (serialized === undefined) throw new TypeError('unsupported root value');
    return serialized;
  } catch {
    throw new TypeError(
      'stableStringify requires an acyclic JSON-serializable value.',
    );
  }
}

function normalize(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null) {
    return value;
  }

  if (typeof value !== 'object') {
    if (
      value === undefined ||
      typeof value === 'bigint' ||
      typeof value === 'function' ||
      typeof value === 'symbol'
    ) {
      throw new TypeError(`Unsupported value type: ${typeof value}`);
    }
    return value;
  }

  if (ancestors.has(value)) throw new TypeError('Cyclic value');

  if (Array.isArray(value)) {
    ancestors.add(value);
    try {
      return value.map((item) => normalize(item, ancestors));
    } finally {
      ancestors.delete(value);
    }
  }

  // CQRS requests are usually class instances, so normalize their enumerable
  // payload properties too. Preserve only built-ins with meaningful native
  // JSON serialization or atomic semantics.
  if (isAtomicObject(value)) return value;

  ancestors.add(value);
  const sorted: Record<string, unknown> = {};
  try {
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = normalize(
        (value as Record<string, unknown>)[key],
        ancestors,
      );
    }
  } finally {
    ancestors.delete(value);
  }
  return sorted;
}

function isAtomicObject(value: object): boolean {
  return (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Error ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof ArrayBuffer ||
    ArrayBuffer.isView(value)
  );
}
