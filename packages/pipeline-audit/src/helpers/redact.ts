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

/**
 * Return a deep copy of `value` with the values of any keys in `keys`
 * (case-insensitive) replaced by {@link REDACTED}. Recurses into nested objects
 * and arrays; primitives are returned unchanged. Never mutates the input and is
 * safe against cyclic references.
 *
 * @param value - The payload / response to sanitize.
 * @param keys - Field names to mask (compared case-insensitively).
 */
export function redactValue(
  value: unknown,
  keys: readonly string[] = DEFAULT_REDACT_KEYS,
): unknown {
  const blocked = new Set(keys.map((k) => k.toLowerCase()));
  return redact(value, blocked, new WeakSet());
}

function redact(
  value: unknown,
  blocked: Set<string>,
  seen: WeakSet<object>,
): unknown {
  if (value === null || typeof value !== 'object') return value;

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, blocked, seen));
  }

  // Preserve non-plain objects (Date, Buffer, …) verbatim — only walk plain bags.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = blocked.has(key.toLowerCase())
      ? REDACTED
      : redact(val, blocked, seen);
  }
  return out;
}
