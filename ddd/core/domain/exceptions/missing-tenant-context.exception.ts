/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { DomainException } from './domain.exception';

/**
 * Framework-neutral signal that an operation requiring tenant isolation was
 * attempted without a resolvable tenant identity.
 *
 * `AGENTS.md` rule 5 and the architecture skill's security checklist require
 * failing closed here. A missing tenant must never be collapsed into a shared
 * namespace: every caller whose tenant could not be resolved would then read and
 * write the same cache entries, which is a cross-tenant data leak that produces
 * no error and no log line.
 *
 * Deployments that are genuinely single-tenant make that explicit rather than
 * implicit — pass the tenant to the key helper directly, or configure
 * `PipelineModule.forRoot({ tenantIdFactory: () => 'single' })` so the decision
 * is visible in the composition root.
 */
export class MissingTenantContextError extends DomainException {
  constructor(readonly operation: string) {
    super(
      `Missing tenant context: cannot derive a tenant-scoped key for ${operation}. ` +
        'Supply the tenant explicitly, or configure a tenantIdFactory on PipelineModule. ' +
        'Falling back to a shared namespace would merge tenants into one cache partition.',
    );
  }
}
