/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';

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
