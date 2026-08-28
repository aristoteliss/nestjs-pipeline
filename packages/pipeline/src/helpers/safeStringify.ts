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

const SAFE_PRIMITIVES = new Set(['string', 'number', 'boolean']);

interface ExcludeMatchers {
  flatKeys: Set<string>; // 'token'     → excluded at ANY depth
  pathKeys: Set<string>; // 'ctx.sessionUser'  → excluded ONLY at that exact path
}

function buildExcludeMatchers(excludeKeys: Set<string>): ExcludeMatchers {
  const flatKeys = new Set<string>();
  const pathKeys = new Set<string>();

  for (const key of excludeKeys) {
    if (key.includes('.')) pathKeys.add(key);
    else flatKeys.add(key);
  }

  return { flatKeys, pathKeys };
}

/**
 * Recursively sanitizes a single value: applies key/path-based exclusion,
 * normalizes non-serializable types, and guards against circular references.
 *
 * @param val - The value currently being visited
 * @param path - Dot-path of `val` from the root (e.g. 'ctx.sessionUser')
 * @param matchers - Precomputed flat/path exclusion sets, or null if no exclusion is configured
 * @param ancestors - WeakSet tracking objects on the active recursion path
 */
function sanitizeValue(
  val: unknown,
  path: string,
  matchers: ExcludeMatchers | null,
  ancestors: WeakSet<object>,
): unknown {
  // 1. Null / undefined
  if (val === null) return null;
  if (val === undefined) return undefined;

  // 2. Date → ISO string
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? '[Invalid Date]' : val.toISOString();
  }

  // 3. Error → structured object
  if (val instanceof Error) {
    return { name: val.name, message: val.message, stack: val.stack };
  }

  // 4. Binary data (Buffer, ArrayBuffer, TypedArrays, DataView)
  if (
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) ||
    val instanceof ArrayBuffer ||
    ArrayBuffer.isView(val)
  ) {
    return '[Binary Data]';
  }

  // 5. Stream — requires both pipe and on to reduce false positives
  if (
    typeof val === 'object' &&
    typeof (val as Record<string, unknown>).pipe === 'function' &&
    typeof (val as Record<string, unknown>).on === 'function'
  ) {
    return '[Stream]';
  }

  // 6. Multer file
  if (
    typeof val === 'object' &&
    'originalname' in val &&
    'buffer' in val &&
    Buffer.isBuffer((val as Record<string, unknown>).buffer)
  ) {
    return `[File: ${(val as Record<string, unknown>).originalname}]`;
  }

  // 7. RegExp → string representation
  if (val instanceof RegExp) return val.toString();

  // 8. Map / Set — guard the collection itself before materializing it so a
  // self-reference does not recurse forever.
  if (val instanceof Map) {
    if (ancestors.has(val)) return '[Circular]';
    ancestors.add(val);
    try {
      return sanitizeValue(Object.fromEntries(val), path, matchers, ancestors);
    } finally {
      ancestors.delete(val);
    }
  }
  if (val instanceof Set) {
    if (ancestors.has(val)) return '[Circular]';
    ancestors.add(val);
    try {
      return sanitizeValue([...val], path, matchers, ancestors);
    } finally {
      ancestors.delete(val);
    }
  }

  // 9. Arrays — recurse per item, guarding only the active recursion path.
  // Repeated references in sibling branches are valid and should be serialized
  // normally rather than being mislabeled as circular.
  if (Array.isArray(val)) {
    if (ancestors.has(val)) return '[Circular]';
    ancestors.add(val);
    try {
      return val.map((item) => sanitizeValue(item, path, matchers, ancestors));
    } finally {
      ancestors.delete(val);
    }
  }

  // 10. Objects — recurse per key, applying key/path-based exclusion.
  if (typeof val === 'object') {
    if (ancestors.has(val)) return '[Circular]';
    ancestors.add(val);

    try {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        const currentPath = path ? `${path}.${k}` : k;

        // Key/path-based exclusion
        if (
          matchers &&
          (matchers.flatKeys.has(k) || matchers.pathKeys.has(currentPath))
        ) {
          continue;
        }

        out[k] = sanitizeValue(v, currentPath, matchers, ancestors);
      }
      return out;
    } finally {
      ancestors.delete(val);
    }
  }

  // 11. Leaf primitive validation
  const type = typeof val;
  return SAFE_PRIMITIVES.has(type) ? val : `[${type}]`;
}

/**
 * Sanitizes a value for structured logging: handles circular references,
 * non-serializable types, and optional key exclusion (flat or path-based) —
 * WITHOUT stringifying it. Returns a plain object/array/primitive suitable
 * for handing directly to a structured logger (pino, nestjs-pino, etc.),
 * where fields stay queryable instead of being flattened into text.
 *
 * Flat key:  'token'    → excluded at any depth
 * Path key:  'ctx.sessionUser' → excluded only at that exact path
 *
 * @param value - The value to sanitize
 * @param excludeKeys - Optional Set of keys/paths to exclude from the output
 * @returns The sanitized value (object, array, or primitive)
 */
export function safeSanitize(
  value: unknown,
  excludeKeys?: Set<string>,
): unknown {
  const matchers = excludeKeys?.size ? buildExcludeMatchers(excludeKeys) : null;
  return sanitizeValue(value, '', matchers, new WeakSet());
}

/**
 * Safely converts a value to a JSON string, handling circular references,
 * non-serializable types, and optional key exclusion (flat or path-based).
 *
 * Flat key:  'token'    → excluded at any depth
 * Path key:  'ctx.sessionUser' → excluded only at that exact path
 *
 * @param value - The value to stringify
 * @param excludeKeys - Optional Set of keys/paths to exclude from the output
 * @param indent - Optional indentation (spaces) for pretty-printing
 * @returns The JSON string representation
 */
export function safeStringify(
  value: unknown,
  excludeKeys?: Set<string>,
  indent?: number,
): string {
  return JSON.stringify(safeSanitize(value, excludeKeys), undefined, indent);
}
