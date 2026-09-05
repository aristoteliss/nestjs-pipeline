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
 * Derives a deterministic cache key from a resource name (or entity type) and
 * a set of filter conditions, namespaced by the active tenant schema.
 *
 * Domain aggregates remain pure DDD — they do not declare `prefixKey` or `cacheKey`.
 *
 * Supports explicit tenant ID or pipeline context:
 * 1. Explicit `tenantOrContext` string (e.g., `'tenant_a'`)
 * 2. Pipeline context `ctx.tenantId`
 * 3. Ambient pipelineStore `pipelineStore.getStore()?.tenantId`
 * 4. Default tenant fallback `DEFAULT_TENANT_SCHEMA` ('tenant')
 *
 * Keys are sorted alphabetically so `{ email, department }` and
 * `{ department, email }` produce the same string.
 *
 * @example Single property lookup
 * ```typescript
 * filterCacheKey('user', { id: '123' }, ctx)
 * // → "tenant:user:id:123"
 * ```
 *
 * @example Composite condition with alphabetical sorting
 * ```typescript
 * filterCacheKey('user', { email: 'a@b.com', department: 'eng' }, 'tenant_b')
 * // → "tenant_b:user:department:eng:email:a@b.com"
 * ```
 *
 * @example Inside a QueryRepository @FromCache decorator
 * ```typescript
 * @FromCache<GetUserQuery, User>(
 *   (q) => filterCacheKey('user', { id: q.userId }),
 *   (cached) => User.fromJSON(cached as UserSnapshot),
 * )
 * async find(query: GetUserQuery): Promise<User | null> { ... }
 * ```
 */
export function filterCacheKey(
  resourceOrEntity: string | { prefixKey?: string; name?: string },
  conditions: Record<string, unknown>,
  tenantOrContext?: string | IPipelineContext,
): string {
  const schema =
    typeof tenantOrContext === 'string'
      ? tenantOrContext
      : (tenantOrContext?.tenantId ??
        pipelineStore.getStore()?.tenantId ??
        DEFAULT_TENANT_SCHEMA);

  const prefix =
    typeof resourceOrEntity === 'string'
      ? resourceOrEntity.endsWith(':')
        ? resourceOrEntity
        : `${resourceOrEntity}:`
      : (resourceOrEntity.prefixKey ??
        (resourceOrEntity.name
          ? `${resourceOrEntity.name.toLowerCase()}:`
          : ''));

  const segments = Object.entries(conditions)
    .filter(([, v]) => v !== undefined && v !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(':');

  return `${schema}:${prefix}${segments}`;
}

/**
 * Resolves a template string (e.g. 'user:{userId}' or 'role:id:{id}') against a query/command payload,
 * namespaced by the active tenant schema.
 *
 * Useful for declarative CQRS pipeline behavior caching (`CacheBehavior`) or handler-level cache resolution.
 *
 * @example Pipeline behavior caching on query handler
 * ```typescript
 * @QueryHandler(GetUserQuery)
 * @UsePipeline([
 *   CacheBehavior,
 *   { keyFactory: cacheKeyTemplate('user:{userId}') },
 * ])
 * export class GetUserHandler implements IQueryHandler<GetUserQuery, UserSnapshot> { ... }
 * ```
 *
 * @example Direct invocation with query object
 * ```typescript
 * const getKey = cacheKeyTemplate('user:{userId}');
 * getKey(new GetUserQuery({ userId: '123' }))
 * // → "tenant:user:123"
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

    const schema =
      typeof tenantOrContext === 'string'
        ? tenantOrContext
        : (tenantOrContext?.tenantId ??
          ctx?.tenantId ??
          pipelineStore.getStore()?.tenantId ??
          DEFAULT_TENANT_SCHEMA);

    const resolved = template.replace(/\{(\w+)\}/g, (_, prop) => {
      const val = data?.[prop];
      return val !== undefined && val !== null ? String(val) : '';
    });

    const prefix = schema ? `${schema}:` : '';
    return `${prefix}${resolved}`;
  };
}
