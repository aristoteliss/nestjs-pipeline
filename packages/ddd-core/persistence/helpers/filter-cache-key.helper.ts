/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { escapeKeySegment, stableStringify } from '@cqrs-ddd/safe-stringify';
import {
  requireTenantId,
  type TenantSource,
} from '../../application/tenant-scope';

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
 * An explicit tenant for a cache key: a tenant id string, or an object carrying
 * `tenantId`, such as a pipeline context.
 *
 * When it is omitted, or an object carries no `tenantId`, the tenant of the running
 * {@link runWithTenant} scope applies. A missing or empty tenant always throws
 * {@link MissingTenantContextError}; there is no shared fallback namespace.
 */
export type CacheKeyTenantSource = TenantSource;

/**
 * A request-bearing source accepted by the factories of {@link cacheKeyTemplate},
 * such as a pipeline context.
 */
export interface CacheKeyRequestContext {
  readonly request: unknown;
  readonly tenantId?: string | undefined;
}

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
 * @param tenantOrContext - An explicit tenant id, or an object carrying `tenantId` (such
 *   as a pipeline context). When omitted, the tenant of the running
 *   {@link runWithTenant} scope is used. See {@link CacheKeyTenantSource}.
 * @returns A versioned, hashed deterministic cache key.
 * @throws {MissingTenantContextError} When tenant identity cannot be resolved.
 * @throws {TypeError} When conditions contain non-serializable values.
 */
export function filterCacheKey(
  resourceOrEntity: CacheResourceSpecifier,
  conditions: Record<string, unknown>,
  tenantOrContext?: CacheKeyTenantSource,
): string {
  const schema = requireTenantId(tenantOrContext, 'cache key derivation');

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
 * structural characters here and are escaped with {@link escapeKeySegment};
 * nested values delegate to the shared {@link stableStringify} for deterministic
 * recursive ordering.
 */
function canonicalizeValue(val: NonNullable<unknown>): string {
  if (typeof val === 'object') {
    return stableStringify(val);
  }
  return escapeKeySegment(String(val));
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
 * @param tenantOrContext - An explicit tenant used to namespace produced keys. When
 *   omitted, a context source's `tenantId` is used, and otherwise the tenant of the
 *   running {@link runWithTenant} scope.
 * @returns A key factory accepting either a request object or a
 *   {@link CacheKeyRequestContext} (such as a pipeline context).
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
  tenantOrContext?: CacheKeyTenantSource,
): (source: T | CacheKeyRequestContext) => string {
  return (source: T | CacheKeyRequestContext) => {
    const ctx =
      source && typeof source === 'object' && 'request' in source
        ? (source as CacheKeyRequestContext)
        : undefined;
    const data = (ctx ? ctx.request : source) as Record<string, unknown>;
    const schema = requireTenantId(
      tenantOrContext ?? ctx,
      'cache key derivation',
    );

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
