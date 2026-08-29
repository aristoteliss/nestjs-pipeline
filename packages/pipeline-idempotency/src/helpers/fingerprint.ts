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
 * Produces a stable SHA-256 hex digest of an arbitrary value, with object keys
 * sorted so semantically-equal payloads hash identically regardless of property
 * order. Used to detect an idempotency key being reused with a different body.
 */
export function fingerprintValue(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

/** `JSON.stringify` with deterministically ordered object keys. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  // CQRS requests are usually class instances, so normalize their enumerable
  // payload properties too. Preserve only built-ins with meaningful native
  // JSON serialization or atomic semantics.
  if (isAtomicObject(value)) return value;

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = normalize((value as Record<string, unknown>)[key]);
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
