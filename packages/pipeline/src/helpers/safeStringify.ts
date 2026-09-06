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

/** Placeholder substituted for the value of a redacted field. */
export const REDACTED = '[REDACTED]';

/**
 * Field names always masked before an audit record is stored. Matching is
 * case-insensitive; per-handler `redactKeys` are merged on top of these.
 */
export const DEFAULT_REDACT_KEYS: readonly string[] = [
  'password',
  'pass',
  'pwd',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'apiKey',
  'authorization',
  'cookie',
  'ssn',
  'creditCard',
  'cardNumber',
  'cvv',
];

export interface SanitizeOptions {
  /** Keys or dot-paths to completely exclude from the output. */
  excludeKeys?: Set<string> | readonly string[];
  /** Keys or dot-paths to mask with {@link REDACTED} (case-insensitive). */
  redactKeys?: Set<string> | readonly string[];
  /** Replacement string for redacted fields. Default: {@link REDACTED}. */
  redactReplacement?: string;
  /**
   * Sanitization mode:
   * - 'json': normalizes rich types (Date, Map, Set, Error) to JSON-friendly primitives/objects.
   * - 'clone': deeply clones rich types (Date, Map, Set, Error, RegExp) preserving their classes.
   */
  mode?: 'json' | 'clone';
}

const SAFE_PRIMITIVES = new Set(['string', 'number', 'boolean']);

interface SanitizerMatchers {
  flatExclude: Set<string>;
  pathExclude: Set<string>;
  flatRedact: Set<string>;
  pathRedact: Set<string>;
  redactReplacement: string;
  mode: 'json' | 'clone';
}

function buildMatchers(
  options?: SanitizeOptions | Set<string>,
): SanitizerMatchers {
  const flatExclude = new Set<string>();
  const pathExclude = new Set<string>();
  const flatRedact = new Set<string>();
  const pathRedact = new Set<string>();
  let redactReplacement = REDACTED;
  let mode: 'json' | 'clone' = 'json';

  if (options instanceof Set) {
    for (const key of options) {
      if (key.includes('.')) pathExclude.add(key);
      else flatExclude.add(key);
    }
  } else if (options) {
    if (options.mode) mode = options.mode;
    if (options.redactReplacement)
      redactReplacement = options.redactReplacement;

    if (options.excludeKeys) {
      for (const key of options.excludeKeys) {
        if (key.includes('.')) pathExclude.add(key);
        else flatExclude.add(key);
      }
    }
    if (options.redactKeys) {
      for (const key of options.redactKeys) {
        const lower = key.toLowerCase();
        if (lower.includes('.')) pathRedact.add(lower);
        else flatRedact.add(lower);
      }
    }
  }

  return {
    flatExclude,
    pathExclude,
    flatRedact,
    pathRedact,
    redactReplacement,
    mode,
  };
}

function isRedacted(
  key: string,
  path: string,
  matchers: SanitizerMatchers,
): boolean {
  const lowerKey = key.toLowerCase();
  const lowerPath = path.toLowerCase();
  return (
    matchers.flatRedact.has(lowerKey) || matchers.pathRedact.has(lowerPath)
  );
}

function isExcluded(
  key: string,
  path: string,
  matchers: SanitizerMatchers,
): boolean {
  return matchers.flatExclude.has(key) || matchers.pathExclude.has(path);
}

/**
 * Recursively sanitizes/redacts a single value according to matchers.
 */
function sanitizeValue(
  val: unknown,
  path: string,
  matchers: SanitizerMatchers,
  ancestors: WeakSet<object>,
): unknown {
  if (val === null) return null;
  if (val === undefined) return undefined;

  // Primitives
  if (typeof val !== 'object' && typeof val !== 'function') {
    if (matchers.mode === 'clone') return val;
    const type = typeof val;
    return SAFE_PRIMITIVES.has(type) ? val : `[${type}]`;
  }

  if (typeof val === 'function') {
    return matchers.mode === 'clone' ? val : '[Function]';
  }

  // Circular reference guard
  if (ancestors.has(val as object)) return '[Circular]';
  ancestors.add(val as object);

  try {
    // 1. Date
    if (val instanceof Date) {
      if (matchers.mode === 'clone') return new Date(val);
      return Number.isNaN(val.getTime()) ? '[Invalid Date]' : val.toISOString();
    }

    // 2. RegExp
    if (val instanceof RegExp) {
      if (matchers.mode === 'clone') {
        const clone = new RegExp(val.source, val.flags);
        clone.lastIndex = val.lastIndex;
        return clone;
      }
      return val.toString();
    }

    // 3. Error
    if (val instanceof Error) {
      if (matchers.mode === 'clone') {
        const clone = new Error(val.message);
        clone.name = val.name;
        clone.stack = val.stack;
        for (const [key, propVal] of Object.entries(val)) {
          const currentPath = path ? `${path}.${key}` : key;
          const propValue = isRedacted(key, currentPath, matchers)
            ? matchers.redactReplacement
            : sanitizeValue(propVal, currentPath, matchers, ancestors);
          Object.defineProperty(clone, key, {
            value: propValue,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
        copySymbolProperties(val, clone, path, matchers, ancestors);
        return clone;
      }
      return { name: val.name, message: val.message, stack: val.stack };
    }

    // 4. Binary data
    if (
      (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) ||
      val instanceof ArrayBuffer ||
      ArrayBuffer.isView(val)
    ) {
      if (matchers.mode === 'clone') return structuredClone(val);
      return '[Binary Data]';
    }

    // 5. Streams
    if (
      typeof (val as Record<string, unknown>).pipe === 'function' &&
      typeof (val as Record<string, unknown>).on === 'function'
    ) {
      return '[Stream]';
    }

    // 6. Multer File
    if (
      'originalname' in val &&
      'buffer' in val &&
      Buffer.isBuffer((val as Record<string, unknown>).buffer)
    ) {
      return `[File: ${(val as Record<string, unknown>).originalname}]`;
    }

    // 7. Map
    if (val instanceof Map) {
      if (matchers.mode === 'clone') {
        const clone = new Map<unknown, unknown>();
        for (const [k, v] of val) {
          const keyStr = typeof k === 'string' ? k : '';
          const currentPath = path && keyStr ? `${path}.${keyStr}` : keyStr;
          const isRedact = keyStr
            ? isRedacted(keyStr, currentPath, matchers)
            : false;
          clone.set(
            sanitizeValue(k, path, matchers, ancestors),
            isRedact
              ? matchers.redactReplacement
              : sanitizeValue(v, currentPath, matchers, ancestors),
          );
        }
        return clone;
      }
      return sanitizeValue(Object.fromEntries(val), path, matchers, ancestors);
    }

    // 8. Set
    if (val instanceof Set) {
      if (matchers.mode === 'clone') {
        return new Set(
          Array.from(val, (item) =>
            sanitizeValue(item, path, matchers, ancestors),
          ),
        );
      }
      return sanitizeValue([...val], path, matchers, ancestors);
    }

    // 9. Array
    if (Array.isArray(val)) {
      return val.map((item) => sanitizeValue(item, path, matchers, ancestors));
    }

    // 10. Generic Object
    const out: Record<string, unknown> =
      matchers.mode === 'json' ? Object.create(null) : {};

    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      const currentPath = path ? `${path}.${k}` : k;

      if (isExcluded(k, currentPath, matchers)) {
        continue;
      }

      const valOut = isRedacted(k, currentPath, matchers)
        ? matchers.redactReplacement
        : sanitizeValue(v, currentPath, matchers, ancestors);

      if (matchers.mode === 'clone') {
        Object.defineProperty(out, k, {
          value: valOut,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      } else {
        out[k] = valOut;
      }
    }

    if (matchers.mode === 'clone') {
      copySymbolProperties(val, out, path, matchers, ancestors);
    }

    return out;
  } finally {
    ancestors.delete(val as object);
  }
}

function copySymbolProperties(
  source: object,
  target: object,
  path: string,
  matchers: SanitizerMatchers,
  ancestors: WeakSet<object>,
): void {
  for (const sym of Object.getOwnPropertySymbols(source)) {
    const descriptor = Object.getOwnPropertyDescriptor(source, sym);
    if (!descriptor?.enumerable) continue;
    Object.defineProperty(target, sym, {
      value: sanitizeValue(Reflect.get(source, sym), path, matchers, ancestors),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
}

/**
 * Sanitizes a value for structured logging or general processing: handles
 * circular references, non-serializable types, exclusion, and redaction.
 */
export function safeSanitize(
  value: unknown,
  options?: SanitizeOptions | Set<string>,
): unknown {
  const matchers = buildMatchers(options);
  return sanitizeValue(value, '', matchers, new WeakSet());
}

/**
 * Safely converts a value to a JSON string, handling circular references,
 * non-serializable types, and optional key exclusion/redaction.
 */
export function safeStringify(
  value: unknown,
  options?: SanitizeOptions | Set<string>,
  indent?: number,
): string {
  const sanitized = safeSanitize(value, options);
  return JSON.stringify(sanitized, undefined, indent) ?? 'undefined';
}

/**
 * Returns a deep clone of `value` with sensitive keys masked with {@link REDACTED}.
 * Safe against cyclic references and preserves rich object types.
 */
export function redactValue(
  value: unknown,
  keys: readonly string[] = DEFAULT_REDACT_KEYS,
): unknown {
  return safeSanitize(value, {
    redactKeys: keys,
    mode: 'clone',
  });
}
