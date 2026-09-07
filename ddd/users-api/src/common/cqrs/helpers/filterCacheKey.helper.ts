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

import {
  type IPipelineContext,
  pipelineStore,
  stableStringify,
} from '@nestjs-pipeline/core';
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
 * Serializes one filter value into the cache-key segment format.
 *
 * Nested JSON values delegate to the core {@link stableStringify} implementation,
 * so deterministic recursive ordering has one canonical implementation across
 * pipeline cache, idempotency and DDD repository cache keys.
 *
 * Primitive values keep delimiter escaping local to this key format because `:`
 * and `\\` are structural characters in repository cache keys.
 */
function canonicalizeValue(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  if (typeof val === 'object') {
    return stableStringify(val);
  }
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
 * - **Canonical sorting**: top-level filter keys are sorted alphabetically.
 * - **Delimiter escaping**: primitive values containing `:` or `\\` are escaped.
 * - **Deterministic object serialization**: nested JSON values use core `stableStringify`.
 * - **Fail-safe resource prefixes**: fragile constructor names are rejected.
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
 * Resolves a template string (e.g. `user:{userId}`) against a query/command payload,
 * namespaced by the active tenant schema.
 *
 * Required placeholders throw when absent; optional `{prop?}` placeholders resolve
 * to an empty string. Object placeholder values use the same canonical serializer
 * as `filterCacheKey`.
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

    return `${schema}:${resolved}`;
  };
}
