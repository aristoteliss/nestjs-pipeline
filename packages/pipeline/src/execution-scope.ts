/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * The tenant and correlation id of the current execution. An absent field means
 * none is set; nothing is filled in with a default.
 */
export interface ExecutionScope {
  readonly tenantId?: string;
  readonly correlationId?: string;
}

const scope = new AsyncLocalStorage<ExecutionScope>();

/**
 * The scope of the current execution: the values of the innermost
 * {@link runInScope} call, which include the running pipeline's own values.
 * Outside any scope it is empty.
 *
 * Integration packages read it; application code usually reads one value
 * through them, such as `currentTenantId()` of `@nestjs-pipeline/tenant`.
 *
 * @returns The current scope; never `undefined`.
 *
 * @example
 * ```ts
 * const { tenantId, correlationId } = currentScope();
 * ```
 */
export function currentScope(): ExecutionScope {
  return scope.getStore() ?? {};
}

/**
 * Runs `fn` with `values` laid over the current scope, for everything it calls,
 * synchronously or asynchronously. A key present in `values` replaces the
 * current value, including with `undefined`; an absent key keeps it.
 *
 * A pipeline dispatched inside `fn` takes its tenant and correlation id from
 * this scope and runs its behaviors inside a scope holding them, so nested
 * dispatches inherit them.
 *
 * @param values - The values to set for the callback.
 * @param fn - The work to run.
 * @returns What `fn` returns (its promise, for an async callback).
 *
 * @example
 * ```ts
 * await runInScope({ tenantId: 'tenant_a' }, () => processBatch(job.data));
 * ```
 */
export function runInScope<T>(values: ExecutionScope, fn: () => T): T {
  return scope.run({ ...currentScope(), ...values }, fn);
}
