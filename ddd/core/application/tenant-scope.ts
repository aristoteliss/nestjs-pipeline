/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { MissingTenantContextError } from '../domain/exceptions/missing-tenant-context.exception';

const tenantScope = new AsyncLocalStorage<string | undefined>();

/**
 * Runs `fn` with `tenantId` as the current tenant for everything it calls,
 * synchronously or asynchronously.
 *
 * Tenant-scoped helpers such as `filterCacheKey` and `cacheKeyTemplate` read this
 * tenant when no tenant is passed to them explicitly. Set it once where a unit of
 * work enters the application (an HTTP request, a queue job, a command dispatch),
 * rather than passing the tenant through every call. A nested call replaces the
 * tenant for its own callback only; the outer tenant applies again afterwards.
 *
 * Passing `undefined` runs `fn` with no tenant, so tenant-scoped helpers fail
 * closed with `MissingTenantContextError`.
 *
 * @param tenantId - The tenant for the callback, or `undefined` for none.
 * @param fn - The work to run.
 * @returns What `fn` returns (its promise, for an async callback).
 *
 * @example
 * ```ts
 * await runWithTenant(job.data.tenant, () => handler.handle(job.data));
 *
 * // NestJS pipeline application: one global pipeline behavior
 * handle(context: IPipelineContext, next: NextDelegate) {
 *   return runWithTenant(context.tenantId, next);
 * }
 * ```
 */
export function runWithTenant<T>(tenantId: string | undefined, fn: () => T): T {
  return tenantScope.run(tenantId, fn);
}

/**
 * Returns the tenant of the innermost {@link runWithTenant} scope, or `undefined`
 * outside any scope.
 */
export function currentTenantId(): string | undefined {
  return tenantScope.getStore();
}

/**
 * An explicit tenant: a tenant id string, or an object carrying `tenantId`, such
 * as a pipeline context.
 */
export type TenantSource = string | { readonly tenantId?: string | undefined };

/**
 * Returns the tenant for a security-sensitive operation, or fails closed.
 *
 * An explicit string always wins, even an empty one. An object uses its
 * `tenantId`, and without one the tenant of the running {@link runWithTenant}
 * scope applies, as it does when `source` is omitted. Nothing resolved, or an
 * empty tenant, throws {@link MissingTenantContextError}: keys for caches,
 * idempotency and rate limits must never collapse several tenants into one
 * shared namespace.
 *
 * @param source - The explicit tenant, or `undefined` to use the scope.
 * @param purpose - What the tenant is for, named in the error.
 * @returns The non-empty tenant id.
 * @throws {MissingTenantContextError} When no tenant can be resolved.
 *
 * @example
 * ```ts
 * // A key factory that receives the pipeline context:
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
      : (source?.tenantId ?? currentTenantId());
  if (!tenantId) throw new MissingTenantContextError(purpose);
  return tenantId;
}
