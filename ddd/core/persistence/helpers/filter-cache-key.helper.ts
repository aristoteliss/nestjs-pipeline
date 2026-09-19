/* Copyright (C) 2026-present Aristotelis — see repository license. */

import {
  type IPipelineContext,
  pipelineStore,
  stableStringify,
} from '@nestjs-pipeline/core';
import { MissingTenantContextError } from '../../domain/exceptions/missing-tenant-context.exception';

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
 * Fails closed in every environment: tenant-scoped cache keys are never placed
 * into a shared fallback namespace when tenant context is absent.
 *
 * @throws {MissingTenantContextError} When no tenant can be resolved.
 */
function resolveTenantSchema(
  tenantOrContext?: string | IPipelineContext,
): string {
  const schema =
    typeof tenantOrContext === 'string'
      ? tenantOrContext
      : (tenantOrContext?.tenantId ?? pipelineStore.getStore()?.tenantId);

  if (!schema) {
    throw new MissingTenantContextError('cache key derivation');
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
 *
 * @example Single property lookup with entity class
 * ```typescript
 * filterCacheKey(User, { id: '123' }, ctx)
 * // → "tenant:user:id:123"
 * ```
 *
 * @example Composite filter with escaped delimiters
 * ```typescript
 * filterCacheKey('user', { a: 'hello:b:world' }, 'tenant')
 * // → "tenant:user:a:hello\:b\:world"
 * ```
 *
 * @param resourceOrEntity - Logical resource name or object exposing `aggregateName`/`prefixKey`.
 * @param conditions - Filter values that identify the cached record/query.
 * @param tenantOrContext - Explicit tenant id or pipeline context; ambient pipeline context is used when omitted.
 * @returns A tenant-prefixed deterministic cache key.
 * @throws {MissingTenantContextError} When tenant identity cannot be resolved.
 *
 * @example Nested composite identity without [object Object]
 * ```typescript
 * filterCacheKey('deployment', { compose: { service: 'web', file: 'docker-compose.yml' } }, 'tenant')
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
 * Resolves a template string (e.g. `user:{userId}`) against a query/command payload,
 * namespaced by the active tenant schema.
 *
 * Required placeholders throw when absent; optional `{prop?}` placeholders resolve
 * to an empty string. Object placeholder values use the same canonical serializer
 * as `filterCacheKey`.
 *
 * @param template - Key template containing required `{prop}` or optional `{prop?}` placeholders.
 * @param tenantOrContext - Explicit tenant id or context used to namespace produced keys.
 * @returns A key factory accepting either a request object or `IPipelineContext`.
 * @throws {MissingTenantContextError} When tenant identity cannot be resolved.
 * @throws {Error} When a required placeholder is absent.
 *
 * @example
 * ```ts
 * const byId = cacheKeyTemplate<{ userId: string }>('user:{userId}');
 * const key = byId({ userId: '019...' });
 * // tenant-a:user:019...
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

    return `${schema}:${resolved}`;
  };
}
