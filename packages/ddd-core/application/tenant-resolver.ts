/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingTenantContextError } from '../domain/exceptions/missing-tenant-context.exception';

/**
 * An explicit tenant: a tenant id string, or an object carrying `tenantId`, such
 * as a request or job context.
 */
export type TenantSource = string | { readonly tenantId?: string | undefined };

/**
 * Returns the tenant of the running unit of work, or `undefined` when there is
 * none.
 */
export type TenantResolver = () => string | undefined;

let tenantResolver: TenantResolver | undefined;

/**
 * Registers where tenant-scoped helpers such as `filterCacheKey` and
 * `cacheKeyTemplate` find the tenant when none is passed to them, typically the
 * request or job context the application already keeps.
 *
 * Register it once at startup; a later call replaces it, and `undefined` removes
 * it. When the resolver returns nothing, or none is registered, those helpers
 * fail closed with {@link MissingTenantContextError}.
 *
 * @param resolver - Returns the current tenant, or `undefined` for none.
 *
 * @example
 * ```ts
 * const requestTenant = new AsyncLocalStorage<string>();
 * setTenantResolver(() => requestTenant.getStore());
 *
 * // Per request or job:
 * requestTenant.run(tenantId, () => handle(request));
 * ```
 */
export function setTenantResolver(resolver: TenantResolver | undefined): void {
  tenantResolver = resolver;
}

/**
 * Returns the tenant for a security-sensitive operation, or fails closed.
 *
 * An explicit string always wins, even an empty one. An object uses its
 * `tenantId`; without one, or when `source` is omitted, the tenant of the
 * registered {@link setTenantResolver} resolver applies. Nothing resolved, or an
 * empty tenant, throws {@link MissingTenantContextError}: keys for caches,
 * idempotency and rate limits must never collapse several tenants into one
 * shared namespace.
 *
 * @param source - The explicit tenant, or `undefined` to use the resolver.
 * @param purpose - What the tenant is for, named in the error.
 * @returns The non-empty tenant id.
 * @throws {MissingTenantContextError} When no tenant can be resolved.
 *
 * @example
 * ```ts
 * // A key factory that receives a request or job context:
 * const tenantId = requireTenantId(ctx, 'users.create idempotency key');
 * ```
 */
export function requireTenantId(
  source: TenantSource | undefined,
  purpose: string,
): string {
  const tenantId =
    typeof source === 'string'
      ? source
      : (source?.tenantId ?? tenantResolver?.());
  if (!tenantId) throw new MissingTenantContextError(purpose);
  return tenantId;
}
