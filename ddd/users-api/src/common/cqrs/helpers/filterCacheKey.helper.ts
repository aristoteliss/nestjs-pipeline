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

import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';
import { DEFAULT_TENANT_SCHEMA } from '@persistence/postgres-options';

/**
 * Types supported as cache key resource specifiers:
 * - A raw resource string (e.g., `'user'` or `'user:'`)
 * - An entity constructor declaring `static readonly aggregateName = 'user'`
 * - An object declaring `prefixKey`
 */
export type CacheResourceSpecifier =
  | string
  | { aggregateName?: string; prefixKey?: string };

/**
 * Deterministically sorts object keys recursively to ensure identical JSON serialization
 * regardless of key insertion order.
 */
function sortKeysRecursively(val: unknown): unknown {
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(sortKeysRecursively);
  }
  return Object.keys(val as Record<string, unknown>)
    .sort()
    .reduce(
      (acc, key) => {
        acc[key] = sortKeysRecursively((val as Record<string, unknown>)[key]);
        return acc;
      },
      {} as Record<string, unknown>,
    );
}

/**
 * Serializes an individual filter condition value into a canonical, collision-safe string.
 *
 * - Nested objects and arrays are serialized using recursively key-sorted canonical JSON,
 *   preventing ambiguous `[object Object]` representations.
 * - Primitive values (strings, numbers, booleans) have colons (`:`) and backslashes (`\`) escaped
 *   so that values containing delimiters cannot collide with key/value boundaries.
 */
function canonicalizeValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  if (typeof val === 'object') {
    return JSON.stringify(sortKeysRecursively(val));
  }
  // Escape backslash and colon to prevent delimiter injection and key collision
  return String(val).replace(/([\\:])/g, '\\$1');
}

/**
 * Resolves the active tenant schema from explicit arguments, pipeline context,
 * or ambient AsyncLocalStorage.
 *
 * Enforces fail-safe isolation in production (`NODE_ENV === 'production'`) by requiring
 * an explicit tenant context and refusing silent fallback to default schema.
 */
function resolveTenantSchema(
  tenantOrContext?: string | IPipelineContext,
): string {
  let schema =
    typeof tenantOrContext === 'string'
      ? tenantOrContext
      : (tenantOrContext?.tenantId ?? pipelineStore.getStore()?.tenantId);

  if (!schema) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Missing tenant context: cannot derive cache key without an explicit tenant in production mode.',
      );
    }
    schema = DEFAULT_TENANT_SCHEMA;
  }

  return schema;
}

/**
 * Derives a deterministic, collision-safe cache key from a resource name (or entity type) and
 * a set of filter conditions, namespaced by the active tenant schema.
 *
 * Domain aggregates remain pure DDD — they declare only a canonical logical `aggregateName`
 * (e.g., `User.aggregateName = 'user'`) without knowledge of caching or infrastructure.
 *
 * Features:
 * - **Canonical sorting**: Keys are sorted alphabetically (`{ email, id }` produces the same key as `{ id, email }`).
 * - **Delimiter escaping**: Primitive values containing `:` or `\` are escaped to prevent delimiter injection collisions.
 * - **Deterministic object serialization**: Nested objects/composite identities are canonically serialized without `[object Object]`.
 * - **Fail-safe resource prefixes**: Rejects fragile constructor names subject to minification/mangling.
 *
 * @example Single property lookup with entity class
 * ```typescript
 * filterCacheKey(User, { id: '123' }, ctx)
 * // → "tenant:user:id:123"
 * ```
 *
 * @example Composite filter with escaped delimiters
 * ```typescript
 * filterCacheKey('user', { a: 'hello:b:world' })
 * // → "tenant:user:a:hello\:b\:world"
 * ```
 *
 * @example Nested composite identity without [object Object]
 * ```typescript
 * filterCacheKey('deployment', { compose: { service: 'web', file: 'docker-compose.yml' } })
 * // → 'tenant:deployment:compose:{"file":"docker-compose.yml","service":"web"}'
 * ```
 */
export function filterCacheKey(
  resourceOrEntity: CacheResourceSpecifier,
  conditions: Record<string, unknown>,
  tenantOrContext?: string | IPipelineContext,
): string {
  const schema = resolveTenantSchema(tenantOrContext);

  let prefix: string;
  if (typeof resourceOrEntity === 'string') {
    prefix = resourceOrEntity.endsWith(':')
      ? resourceOrEntity
      : `${resourceOrEntity}:`;
  } else if (
    resourceOrEntity &&
    (typeof resourceOrEntity === 'object' ||
      typeof resourceOrEntity === 'function')
  ) {
    if (resourceOrEntity.aggregateName) {
      prefix = resourceOrEntity.aggregateName.endsWith(':')
        ? resourceOrEntity.aggregateName
        : `${resourceOrEntity.aggregateName}:`;
    } else if (resourceOrEntity.prefixKey) {
      prefix = resourceOrEntity.prefixKey.endsWith(':')
        ? resourceOrEntity.prefixKey
        : `${resourceOrEntity.prefixKey}:`;
    } else {
      throw new Error(
        'Cannot resolve cache key prefix: resourceOrEntity must be a string or declare a static aggregateName or prefixKey.',
      );
    }
  } else {
    throw new Error(
      'Cannot resolve cache key prefix: resourceOrEntity must be a string or declare a static aggregateName or prefixKey.',
    );
  }

  const segments = Object.entries(conditions)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${canonicalizeValue(v)}`)
    .join(':');

  return `${schema}:${prefix}${segments}`;
}

/**
 * Resolves a template string (e.g. 'user:{userId}' or 'role:id:{id}') against a query/command payload,
 * namespaced by the active tenant schema.
 *
 * - Required placeholders `{prop}`: Throws a descriptive `Error` if the property is missing or nullish.
 * - Optional placeholders `{prop?}`: Resolves to an empty string if the property is missing or nullish.
 *
 * @example Required placeholder (throws if userId is missing)
 * ```typescript
 * const getKey = cacheKeyTemplate('user:{userId}');
 * getKey({ userId: '123' }); // → "tenant:user:123"
 * getKey({}); // Throws Error: Cannot resolve cache key template: missing required placeholder "userId"
 * ```
 *
 * @example Optional placeholder
 * ```typescript
 * const getKey = cacheKeyTemplate('user:{userId}:{scope?}');
 * getKey({ userId: '123' }); // → "tenant:user:123:"
 * ```
 */
export function cacheKeyTemplate<T = Record<string, unknown>>(
  template: string,
  tenantOrContext?: string | IPipelineContext,
): (source: T | IPipelineContext) => string {
  return (source: T | IPipelineContext) => {
    const ctx =
      source && typeof source === 'object' && 'request' in source
        ? (source as IPipelineContext)
        : undefined;
    const data = (ctx ? ctx.request : source) as Record<string, unknown>;

    const schema = resolveTenantSchema(tenantOrContext ?? ctx);

    const resolved = template.replace(
      /\{(\w+)(\?)?\}/g,
      (_, prop, optional) => {
        const val = data?.[prop];
        if (val !== undefined && val !== null) {
          return canonicalizeValue(val);
        }
        if (optional) {
          return '';
        }
        throw new Error(
          `Cannot resolve cache key template: missing required placeholder "${prop}".`,
        );
      },
    );

    const prefix = schema ? `${schema}:` : '';
    return `${prefix}${resolved}`;
  };
}
