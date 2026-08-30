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

import type { IPipelineContext } from '@nestjs-pipeline/core';

/**
 * Deterministic JSON stringify for JSON-serializable, acyclic values. Object
 * keys are sorted recursively so structurally equal payloads produce the same
 * cache key regardless of property insertion order. Unsupported inputs fail
 * with a deliberate TypeError instead of returning a non-string value.
 */
export function stableStringify(value: unknown): string {
  try {
    return JSON.stringify(normalizeJson(value, new WeakSet<object>()));
  } catch {
    throw new TypeError(
      'stableStringify requires an acyclic JSON-serializable value.',
    );
  }
}

function normalizeJson(value: unknown, ancestors: WeakSet<object>): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Non-finite number');
    }
    return value;
  }

  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported value type: ${typeof value}`);
  }

  if (ancestors.has(value)) throw new TypeError('Cyclic value');

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('Invalid date');
    return value.toISOString();
  }

  if (isUnsupportedObject(value)) {
    throw new TypeError(`Unsupported object: ${value.constructor.name}`);
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => normalizeJson(item, ancestors));
    }

    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = Object.create(null);
    for (const key of Object.keys(source).sort()) {
      result[key] = normalizeJson(source[key], ancestors);
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
 * Default cache-key factory: combines the request name with a stable
 * serialization of the request payload.
 */
export function defaultCacheKey(context: IPipelineContext): string {
  return `${context.requestName}:${stableStringify(context.request)}`;
}
