/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';
import { type IPipelineContext, pipelineStore } from '@nestjs-pipeline/core';

interface TenantScope {
  readonly tenantId: string | undefined;
  /** The pipeline execution that was running when the scope was entered. */
  readonly pipeline: IPipelineContext | undefined;
}

const tenantScope = new AsyncLocalStorage<TenantScope>();

/**
 * Runs `fn` with `tenantId` as the current tenant for everything it calls,
 * synchronously or asynchronously.
 *
 * Use it for work that runs outside a pipeline, such as a queue job, or to
 * change the tenant for part of a handler. A pipeline dispatched from inside
 * `fn` runs with its own tenant. A nested call replaces the tenant for its own
 * callback only, and `undefined` runs `fn` with no tenant.
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
  return tenantScope.run({ tenantId, pipeline: pipelineStore.getStore() }, fn);
}

/**
 * Returns the current tenant: that of the innermost {@link runWithTenant} call
 * or pipeline execution, whichever was entered last, or `undefined` outside
 * both.
 *
 * A pipeline execution's tenant is its context's `tenantId`, which the
 * pipeline's `tenantIdFactory` resolves and nested dispatches inherit.
 *
 * @returns The current tenant id, or `undefined` for none.
 *
 * @example
 * ```ts
 * runWithTenant('tenant_a', () => currentTenantId()); // 'tenant_a'
 * ```
 */
export function currentTenantId(): string | undefined {
  const pipeline = pipelineStore.getStore();
  const scope = tenantScope.getStore();
  if (scope && (pipeline === undefined || scope.pipeline === pipeline)) {
    return scope.tenantId;
  }
  return pipeline?.tenantId;
}
