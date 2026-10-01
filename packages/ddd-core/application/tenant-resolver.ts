/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { MissingTenantContextError } from '../domain/exceptions/missing-tenant-context.exception.js';

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
 * Registers where tenant-scoped helpers such as `cacheKey` and
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
 * @param purpose - What the tenant is for, named in the error.
 * @param source - The explicit tenant; omitted, the resolver's tenant.
 * @returns The non-empty tenant id.
 * @throws {MissingTenantContextError} When no tenant can be resolved.
 *
 * @example
 * ```ts
 * // The tenant of the running unit of work, through the resolver:
 * const tenantId = requireTenant('access token issuance');
 *
 * // A key factory that receives a request or job context:
 * const keyTenant = requireTenant('users.create idempotency key', ctx);
 * ```
 */
export function requireTenant(purpose: string, source?: TenantSource): string {
  const tenantId =
    typeof source === 'string'
      ? source
      : (source?.tenantId ?? tenantResolver?.());
  if (!tenantId) throw new MissingTenantContextError(purpose);
  return tenantId;
}

/**
 * Returns the tenant for a security-sensitive operation, or fails closed; see
 * {@link requireTenant}, which it calls.
 *
 * @deprecated Use {@link requireTenant}, which takes the required `purpose`
 *   first and the optional `source` last.
 *
 * @example
 * ```ts
 * requireTenantId(ctx, 'users.create idempotency key');
 * // becomes
 * requireTenant('users.create idempotency key', ctx);
 * ```
 */
export function requireTenantId(
  source: TenantSource | undefined,
  purpose: string,
): string {
  return requireTenant(purpose, source);
}
