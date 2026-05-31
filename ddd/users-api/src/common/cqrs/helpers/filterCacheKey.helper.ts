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
 * Derives a deterministic cache key from an entity's static `prefixKey` and
 * a set of filter conditions.
 *
 * Keys are sorted alphabetically so `{ email, _department }` and
 * `{ _department, email }` produce the same string.
 *
 * @example
 * filterCacheKey(User, { _id: '123' })
 * // → "user:_id:123"
 *
 * filterCacheKey(User, { email: 'a@b.com', _department: 'eng' })
 * // → "user:_department:eng:email:a@b.com"
 */
export function filterCacheKey(
  entity: { prefixKey: string },
  conditions: Record<string, unknown>,
): string {
  const segments = Object.entries(conditions)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(':');

  return `${entity.prefixKey}${segments}`;
}
