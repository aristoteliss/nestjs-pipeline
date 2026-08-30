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
 * Serialize an audit value without silently collapsing or dropping JavaScript
 * values that native JSON.stringify cannot represent faithfully. Tagged objects
 * keep the representation explicit and portable across log and database sinks.
 */
export function stringifyAuditValue(value: unknown, space?: number): string {
  return JSON.stringify(normalizeAuditValue(value, new WeakSet()), null, space);
}

function normalizeAuditValue(
  value: unknown,
  ancestors: WeakSet<object>,
): unknown {
  if (typeof value === 'bigint') {
    return { $type: 'BigInt', value: value.toString() };
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return { $type: 'Number', value: String(value) };
  }
  if (typeof value === 'function') {
    return { $type: 'Function', name: value.name || null };
  }
  if (typeof value === 'symbol') {
    return { $type: 'Symbol', description: value.description ?? null };
  }
  if (value === undefined) return { $type: 'Undefined' };
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) return '[Circular]';

  if (value instanceof Date) return value.toISOString();
  if (value instanceof RegExp) {
    return {
      $type: 'RegExp',
      source: value.source,
      flags: value.flags,
      lastIndex: value.lastIndex,
    };
  }

  ancestors.add(value);
  try {
    if (value instanceof Error) {
      return {
        $type: 'Error',
        name: value.name,
        message: value.message,
        stack: value.stack,
        properties: normalizeAuditValue(
          Object.fromEntries(Object.entries(value)),
          ancestors,
        ),
      };
    }
    if (value instanceof Map) {
      return {
        $type: 'Map',
        entries: Array.from(value, ([key, item]) => [
          normalizeAuditValue(key, ancestors),
          normalizeAuditValue(item, ancestors),
        ]),
      };
    }
    if (value instanceof Set) {
      return {
        $type: 'Set',
        values: Array.from(value, (item) =>
          normalizeAuditValue(item, ancestors),
        ),
      };
    }
    if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
      const bytes =
        value instanceof ArrayBuffer
          ? new Uint8Array(value)
          : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      return {
        $type: value.constructor.name,
        bytes: Array.from(bytes),
      };
    }
    if (Array.isArray(value)) {
      return Array.from({ length: value.length }, (_, index) =>
        index in value
          ? normalizeAuditValue(value[index], ancestors)
          : { $type: 'ArrayHole' },
      );
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeAuditValue(item, ancestors),
      ]),
    );
  } finally {
    ancestors.delete(value);
  }
}
