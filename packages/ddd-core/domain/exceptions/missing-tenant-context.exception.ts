/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from './domain.exception.js';

/**
 * Framework-neutral signal that an operation requiring tenant isolation was
 * attempted without a resolvable tenant identity.
 *
 * Tenant-scoped operations fail closed here. A missing tenant must never be
 * collapsed into a shared or default tenant: every caller whose tenant could not
 * be resolved would then read and write the same cache entries or database,
 * which is a cross-tenant data leak that produces no error and no log line.
 *
 * Deployments that are genuinely single-tenant make that explicit rather than
 * implicit: pass a fixed tenant id to the key helper, or register
 * `setTenantResolver(() => 'single')`, so the decision is visible in code.
 *
 * @example
 * ```ts
 * if (!tenantId) throw new MissingTenantContextError('users.create idempotency key');
 * ```
 */
export class MissingTenantContextError extends DomainException {
  constructor(readonly operation: string) {
    super(
      `Missing tenant context for ${operation}. Run it inside a tenant scope or pass ` +
        'the tenant explicitly; it never falls back to a shared or default tenant.',
    );
  }
}
