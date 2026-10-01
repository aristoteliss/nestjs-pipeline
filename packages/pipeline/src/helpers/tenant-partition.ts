/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IPipelineContext } from '../interfaces/pipeline.context.interface.js';

/** How a partitioned key treats the tenant, shared by every key factory. */
export interface TenantPartitionOptions {
  /**
   * Whether the key has a tenant segment, so equal identifiers in two tenants
   * never share a key.
   *
   * @default true
   */
  includeTenant?: boolean;

  /**
   * Whether a missing tenant is an error rather than an absent segment.
   * `includeTenant` answers "is the tenant part of the key"; this answers "may
   * it be absent".
   *
   * @default the value of `includeTenant`
   */
  requireTenant?: boolean;
}

/**
 * The tenant segment of a partitioned key: `[context.tenantId]`, or `[]` when
 * `includeTenant` is `false`.
 *
 * @param missing - The package's partition error, raised with the dimension
 *   `'tenant'` when the tenant is required and absent.
 * @throws What `missing` builds, when a required tenant is absent.
 *
 * @example
 * ```ts
 * joinKeySegments([
 *   ...tenantSegments(context, options, MissingRateLimitPartitionError),
 *   caller,
 *   context.requestName,
 * ]);
 * ```
 */
export function tenantSegments(
  context: IPipelineContext,
  options: TenantPartitionOptions,
  missing: new (
    requestName: string,
    dimension: 'tenant',
    remedy: string,
  ) => Error,
): (string | undefined)[] {
  const includeTenant = options.includeTenant ?? true;
  if ((options.requireTenant ?? includeTenant) && !context.tenantId) {
    throw new missing(
      context.requestName,
      'tenant',
      'Run the request inside a tenant scope (runWithTenant of @nestjs-pipeline/tenant), ' +
        'or pass requireTenant: false for a single-tenant deployment.',
    );
  }
  return includeTenant ? [context.tenantId] : [];
}
