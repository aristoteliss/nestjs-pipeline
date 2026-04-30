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
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

const SAFE_PRIMITIVES = new Set(['string', 'number', 'boolean']);

interface ExcludeMatchers {
  flatKeys: Set<string>;  // 'token'     → excluded at ANY depth
  pathKeys: Set<string>;  // 'ctx.sessionUser'  → excluded ONLY at that exact path
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
  const seen = new WeakSet();

  // Only build matchers / pathMap when exclusion is actually needed
  const matchers = excludeKeys?.size ? buildExcludeMatchers(excludeKeys) : null;
  const pathMap = matchers ? new WeakMap<object, string>() : null;

  return JSON.stringify(
    value,
    function (this: unknown, key: string, val: unknown) {

      // 1. Path tracking — register each object's path so children can look it up
      if (pathMap && val !== null && typeof val === 'object') {
        const parentPath = pathMap.get(this as object) ?? '';
        const currentPath = key ? (parentPath ? `${parentPath}.${key}` : key) : '';
        pathMap.set(val as object, currentPath);
      }

      // 2. Key/path-based exclusion (skip root key which is always '')
      if (key && matchers) {
        const parentPath = pathMap?.get(this as object) ?? '';
        const currentPath = parentPath ? `${parentPath}.${key}` : key;

        if (matchers.flatKeys.has(key) || matchers.pathKeys.has(currentPath)) {
          return undefined;
        }
      }

      // 3. Null / undefined
      if (val === null) return null;
      if (val === undefined) return undefined;

      // 4. Date → ISO string
      if (val instanceof Date) return val.toISOString();

      // 5. Error → structured object
      if (val instanceof Error) {
        return { name: val.name, message: val.message, stack: val.stack };
      }

      // 6. Binary data (Buffer, ArrayBuffer, TypedArrays, DataView)
      if (
        (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) ||
        val instanceof ArrayBuffer ||
        ArrayBuffer.isView(val)
      ) {
        return '[Binary Data]';
      }

      // 7. Stream — requires both pipe and on to reduce false positives
      if (
        typeof val === 'object' &&
        typeof (val as Record<string, unknown>).pipe === 'function' &&
        typeof (val as Record<string, unknown>).on === 'function'
      ) {
        return '[Stream]';
      }

      // 8. Multer file
      if (
        typeof val === 'object' &&
        'originalname' in val &&
        'buffer' in val &&
        Buffer.isBuffer((val as Record<string, unknown>).buffer)
      ) {
        return `[File: ${(val as Record<string, unknown>).originalname}]`;
      }

      // 9. RegExp → string representation
      if (val instanceof RegExp) return val.toString();

      // 10. Map / Set — both silently emit {} without this
      if (val instanceof Map) return Object.fromEntries(val);
      if (val instanceof Set) return [...val];

      // 11. Circular reference check
      if (typeof val === 'object') {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
        return val;
      }

      // 12. Leaf primitive validation
      const type = typeof val;
      return SAFE_PRIMITIVES.has(type) ? val : `[${type}]`;
    },
    indent,
  );
}
