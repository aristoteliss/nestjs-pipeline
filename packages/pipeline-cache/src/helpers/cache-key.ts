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
 * Deterministic JSON stringify: object keys are sorted recursively so that
 * structurally equal payloads always produce the same cache key regardless of
 * property insertion order.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
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
}

/**
 * Default cache-key factory: combines the request name with a stable
 * serialization of the request payload.
 */
export function defaultCacheKey(context: IPipelineContext): string {
  return `${context.requestName}:${stableStringify(context.request)}`;
}
