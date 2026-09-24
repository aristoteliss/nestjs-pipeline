/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from './domain.exception';

/**
 * Framework-neutral signal that an operation requiring tenant isolation was
 * attempted without a resolvable tenant identity.
 *
 * Tenant-scoped operations fail closed here. A missing tenant must never be
 * collapsed into a shared namespace: every caller whose tenant could not be
 * resolved would then read and write the same cache entries, which is a
 * cross-tenant data leak that produces no error and no log line.
 *
 * Deployments that are genuinely single-tenant make that explicit rather than
 * implicit: pass a fixed tenant id to the key helper, or run the work inside
 * `runWithTenant('single', ...)`, so the decision is visible in code.
 */
export class MissingTenantContextError extends DomainException {
  constructor(readonly operation: string) {
    super(
      `Missing tenant context: cannot derive a tenant-scoped key for ${operation}. ` +
        'Pass the tenant explicitly, or run the operation inside runWithTenant(...). ' +
        'Falling back to a shared namespace would merge tenants into one cache partition.',
    );
  }
}
