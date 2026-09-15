/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
      const symbolProperties = normalizeSymbolProperties(value, ancestors);
      return {
        $type: 'Error',
        name: value.name,
        message: value.message,
        stack: value.stack,
        properties: normalizeAuditValue(
          Object.fromEntries(Object.entries(value)),
          ancestors,
        ),
        ...(symbolProperties.length > 0 ? { symbolProperties } : {}),
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

    const properties = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeAuditValue(item, ancestors),
      ]),
    );
    const symbolProperties = normalizeSymbolProperties(value, ancestors);
    return symbolProperties.length > 0
      ? { $type: 'Object', properties, symbolProperties }
      : properties;
  } finally {
    ancestors.delete(value);
  }
}

function normalizeSymbolProperties(
  value: object,
  ancestors: WeakSet<object>,
): unknown[][] {
  return Object.getOwnPropertySymbols(value)
    .filter(
      (key) => Object.getOwnPropertyDescriptor(value, key)?.enumerable === true,
    )
    .map((key) => [
      normalizeAuditValue(key, ancestors),
      normalizeAuditValue(Reflect.get(value, key), ancestors),
    ]);
}
