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
    const serialized = JSON.stringify(value, (_key, val) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const source = val as Record<string, unknown>;
        return Object.keys(source)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = source[key];
            return acc;
          }, {});
      }
      return val;
    });

    if (serialized === undefined) throw new TypeError('unsupported root value');
    return serialized;
  } catch {
    throw new TypeError(
      'stableStringify requires an acyclic JSON-serializable value.',
    );
  }
}

/**
 * Default cache-key factory: combines the request name with a stable
 * serialization of the request payload.
 */
export function defaultCacheKey(context: IPipelineContext): string {
  return `${context.requestName}:${stableStringify(context.request)}`;
}
