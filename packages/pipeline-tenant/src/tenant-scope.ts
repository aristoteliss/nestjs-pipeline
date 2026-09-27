/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { currentScope, runInScope } from '@nestjs-pipeline/core';

/**
 * Runs `fn` with `tenantId` as the current tenant for everything it calls,
 * synchronously or asynchronously.
 *
 * Use it where work enters the application, such as HTTP middleware or a queue
 * job, or to change the tenant for part of a handler. A pipeline dispatched
 * inside `fn` takes this tenant, and nested dispatches inherit it. A nested
 * call replaces the tenant for its own callback only, and `undefined` runs `fn`
 * with no tenant.
 *
 * @param tenantId - The tenant for the callback, or `undefined` for none.
 * @param fn - The work to run.
 * @returns What `fn` returns (its promise, for an async callback).
 *
 * @example
 * ```ts
 * await runWithTenant(job.data.tenant, () => processBatch(job.data));
 * ```
 */
export function runWithTenant<T>(tenantId: string | undefined, fn: () => T): T {
  return runInScope({ tenantId }, fn);
}

/**
 * Returns the current tenant: that of the innermost {@link runWithTenant} call
 * or running pipeline, or `undefined` outside both. A running pipeline's tenant
 * is its `context.tenantId`, which it took from the scope when it started.
 *
 * @returns The current tenant id, or `undefined` for none.
 *
 * @example
 * ```ts
 * runWithTenant('tenant_a', () => currentTenantId()); // 'tenant_a'
 * ```
 */
export function currentTenantId(): string | undefined {
  return currentScope().tenantId;
}
