import type { IPipelineContext } from '@nestjs-pipeline/core';

/**
 * Raised when a security-sensitive pipeline key cannot be partitioned by tenant.
 *
 * This is a technical execution-context failure, not an HTTP/domain outcome.
 */
export class MissingTenantContextError extends Error {
  constructor(readonly purpose: string) {
    super(`Missing tenant context for ${purpose}.`);
    this.name = MissingTenantContextError.name;
  }
}

/**
 * Returns the active pipeline tenant or fails closed.
 *
 * Idempotency and rate-limit keys must never silently collapse requests from
 * multiple tenants into a shared fallback namespace. Call this helper for every
 * security-sensitive key factory whose isolation depends on `ctx.tenantId`.
 */
export function requireTenantId(
  ctx: Pick<IPipelineContext, 'tenantId'>,
  purpose: string,
): string {
  if (!ctx.tenantId) {
    throw new MissingTenantContextError(purpose);
  }
  return ctx.tenantId;
}
