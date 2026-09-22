/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
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
 * Normalizes filter conditions for canonical tuple construction:
 * - Omits undefined properties.
 * - Retains null values.
 * - Preserves scalar and structured types.
 * - Rejects non-serializable types (functions, symbols, BigInt).
 */
function normalizeFilterConditions(
  conditions: Record<string, unknown>,
): Record<string, unknown> {
  const sortedKeys = Object.keys(conditions).sort();
  const normalized: Record<string, unknown> = {};

  for (const key of sortedKeys) {
    const val = conditions[key];
    if (val === undefined) {
      continue;
    }
    if (
      typeof val === 'function' ||
      typeof val === 'symbol' ||
      typeof val === 'bigint'
    ) {
      throw new TypeError(
        `filterCacheKey does not support values of type ${typeof val}.`,
      );
    }
    normalized[key] = val;
  }

  return normalized;
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
 * Derives a deterministic, collision-safe cache key from a canonical structured
 * tuple `[tenant, resource, normalizedFilter]`, versioned and hashed with SHA-256.
 *
 * Guarantees:
 * - **Deterministic ordering**: object keys are sorted recursively.
 * - **Type preservation**: numbers, booleans, strings, and nulls produce distinct representations.
 * - **Null retention**: explicit `null` conditions are preserved, distinct from omitted/undefined keys.
 * - **Fail-safe boundaries**: non-serializable types and cyclic structures are rejected.
 * - **Versioned namespace**: keys are namespaced as `${tenant}:${resource}:v1:${hash}`.
 *
 * @param resourceOrEntity - Logical resource name or object exposing `aggregateName`/`prefixKey`.
 * @param conditions - Filter values that identify the cached record/query.
 * @param tenantOrContext - Explicit tenant id or pipeline context; ambient pipeline context is used when omitted.
 * @returns A versioned, hashed deterministic cache key.
 * @throws {MissingTenantContextError} When tenant identity cannot be resolved.
 * @throws {TypeError} When conditions contain non-serializable values.
 */
export function filterCacheKey(
  resourceOrEntity: CacheResourceSpecifier,
  conditions: Record<string, unknown>,
  tenantOrContext?: string | IPipelineContext,
): string {
  const schema = resolveTenantSchema(tenantOrContext);

  let resource: string | undefined;
  if (typeof resourceOrEntity === 'string') {
    resource = resourceOrEntity;
  } else if (
    resourceOrEntity &&
    (typeof resourceOrEntity === 'object' ||
      typeof resourceOrEntity === 'function')
  ) {
    resource =
      resourceOrEntity.aggregateName || resourceOrEntity.prefixKey || undefined;
  }
  if (resource === undefined) {
    throw new Error(
      'Cannot resolve cache key prefix: resourceOrEntity must be a string or declare a static aggregateName or prefixKey.',
    );
  }
  resource = resource.replace(/:+$/, '');

  const normalizedFilter = normalizeFilterConditions(conditions);
  const tuple = [schema, resource, normalizedFilter];
  const serializedTuple = stableStringify(tuple);
  const hash = createHash('sha256').update(serializedTuple).digest('hex');

  return `${schema}:${resource}:v1:${hash}`;
}

/**
 * Serializes one template placeholder value into a key segment.
 *
 * Template keys stay human-readable rather than hashed, so `:` and `\\` remain
 * structural characters here and are escaped; nested values delegate to the
 * shared {@link stableStringify} for deterministic recursive ordering.
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
