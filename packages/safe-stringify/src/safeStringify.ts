/* Copyright (C) 2026-present Aristotelis — see repository license. */

/** Placeholder substituted for the value of a redacted field. */
export const REDACTED = '[REDACTED]';

/**
 * Commonly sensitive field names. Redaction matches a key ignoring case, `_`
 * and `-`, so `refreshToken` also masks `refresh_token` and `REFRESH-TOKEN`;
 * a name list cannot recognize every secret, so add application-specific
 * names through `redactKeys`.
 */
export const DEFAULT_REDACT_KEYS: readonly string[] = [
  'password',
  'passwordHash',
  'pass',
  'pwd',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'sessionToken',
  'secret',
  'clientSecret',
  'privateKey',
  'apiKey',
  'xApiKey',
  'authorization',
  'proxyAuthorization',
  'cookie',
  'setCookie',
  'ssn',
  'creditCard',
  'cardNumber',
  'cvv',
];

export interface SanitizeOptions {
  /** Keys or dot-paths to completely exclude from the output (exact, case-sensitive match). */
  excludeKeys?: Set<string> | readonly string[];
  /** Keys or dot-paths to mask with {@link REDACTED}, matched ignoring case, `_` and `-`. */
  redactKeys?: Set<string> | readonly string[];
  /** Replacement string for redacted fields. Default: {@link REDACTED}. */
  redactReplacement?: string;
  /**
   * Sanitization mode:
   * - 'json': normalizes rich types (Date, Map, Set, Error) to JSON-friendly primitives/objects.
   * - 'clone': deeply clones Date, RegExp, Map, Set, and binary values with their classes. An
   *   Error becomes a plain `Error` carrying its name, message, stack, and own enumerable
   *   properties; any other object becomes a plain object.
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

  if (options instanceof Set) options = { excludeKeys: options };
  if (options) {
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
        const normalized = normalizeRedactKey(key);
        if (normalized.includes('.')) pathRedact.add(normalized);
        else flatRedact.add(normalized);
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

function normalizeRedactKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function isRedacted(
  key: string,
  path: string,
  matchers: SanitizerMatchers,
): boolean {
  return (
    matchers.flatRedact.has(normalizeRedactKey(key)) ||
    matchers.pathRedact.has(normalizeRedactKey(path))
  );
}

function isExcluded(
  key: string,
  path: string,
  matchers: SanitizerMatchers,
): boolean {
  return matchers.flatExclude.has(key) || matchers.pathExclude.has(path);
}

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
        copyProperties(val, clone, path, matchers, ancestors);
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
          if (keyStr && isExcluded(keyStr, currentPath, matchers)) continue;
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

    copyProperties(val, out, path, matchers, ancestors);

    return out;
  } finally {
    ancestors.delete(val as object);
  }
}

function copyProperties(
  source: object,
  target: object,
  path: string,
  matchers: SanitizerMatchers,
  ancestors: WeakSet<object>,
): void {
  for (const [k, v] of Object.entries(source)) {
    const currentPath = path ? `${path}.${k}` : k;

    if (isExcluded(k, currentPath, matchers)) {
      continue;
    }

    const valOut = isRedacted(k, currentPath, matchers)
      ? matchers.redactReplacement
      : sanitizeValue(v, currentPath, matchers, ancestors);

    Object.defineProperty(target, k, {
      value: valOut,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  if (matchers.mode !== 'clone') return;
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
 * Returns a copy of `value` with the given keys masked with {@link REDACTED}.
 *
 * Copies in the `'clone'` mode of {@link SanitizeOptions}: Date, RegExp, Map,
 * Set, and binary values keep their classes; an Error becomes a plain `Error`
 * with the same name, message, stack, and own enumerable properties; any other
 * object becomes a plain object. A cyclic reference becomes `'[Circular]'`,
 * streams and Multer files become placeholder strings, and functions are
 * returned by reference.
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
