/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { joinKeySegments } from '@cqrs-ddd/safe-stringify';
import { type IPipelineContext } from '@nestjs-pipeline/core';
import { MissingRateLimitPartitionError } from '../errors/missing-partition.error';
import type { RateLimitKeyFactory } from '../interfaces/rate-limit-options.interface';

/**
 * Resolves the stable caller/partition identifier used by
 * {@link createPartitionedRateLimitKeyFactory}.
 *
 * Typical values are an authenticated user ID, account ID, API-client ID, or a
 * trusted transport identity copied into `context.items` by an earlier behavior.
 */
export type RateLimitPartitionFactory = (
  context: IPipelineContext,
) => string | undefined;

/** Options for {@link createPartitionedRateLimitKeyFactory}. */
export interface PartitionedRateLimitKeyOptions {
  /**
   * Include `context.tenantId` before the caller partition.
   *
   * This prevents the same user/account identifier in two tenants from sharing a
   * limiter bucket accidentally.
   *
   * @default true
   */
  includeTenant?: boolean;

  /**
   * Whether a missing tenant is an error rather than an omitted segment.
   *
   * `includeTenant` answers "should the tenant be part of the key"; this answers
   * "may it be absent".
   *
   * Defaults to the value of `includeTenant`: asking for tenant partitioning
   * implies that a missing tenant is a configuration failure, not a shrug.
   */
  requireTenant?: boolean;

  /**
   * Behavior when the partition factory cannot resolve a non-empty identity.
   *
   * - `throw` — fail before consuming the limiter (recommended for per-caller
   *   security limits because silently falling back could merge callers).
   * - `request` — fall back to a bucket shared by every caller of this request
   *   within the same tenant partition.
   *
   * @default 'throw'
   */
  onMissingPartition?: 'throw' | 'request';
}

/**
 * Creates a {@link RateLimitKeyFactory} for per-caller limits.
 *
 * Segments are escaped and joined through the core key helper so tenant,
 * caller/account identity, and request name remain distinct even when values
 * contain separator characters.
 *
 * @param partitionFactory - Resolves the stable caller/account identity.
 * @param options - Tenant and missing-partition policy.
 * @returns A `RateLimitKeyFactory` suitable for `RateLimitBehaviorOptions.keyFactory`.
 * @throws {MissingRateLimitPartitionError} When a required tenant or caller partition is absent.
 *
 * The produced key is `<tenantId>:<partition>:<requestName>` when tenant
 * inclusion is enabled, `<partition>:<requestName>` otherwise.
 * `RateLimitBehaviorOptions.keyPrefix` is still applied afterwards by
 * `buildRateLimitKey()`, so environment/service prefixes remain orthogonal.
 *
 * @example Per authenticated user, tenant-aware and fail-closed by default
 * ```ts
 * const perUserKey = createPartitionedRateLimitKeyFactory((ctx) =>
 *   ctx.items.get('currentUserId') as string | undefined,
 * );
 *
 * @UsePipeline([RateLimitBehavior, { keyFactory: perUserKey, keyPrefix: 'write-api' }])
 * export class CreateOrderHandler {}
 * ```
 *
 * @example Single-tenant deployment — say so explicitly
 * ```ts
 * createPartitionedRateLimitKeyFactory(readUserId, { includeTenant: false });
 * ```
 *
 * @example Account-wide bucket shared by every user in the account
 * ```ts
 * createPartitionedRateLimitKeyFactory(readAccountId, { includeTenant: true });
 * ```
 */
export function createPartitionedRateLimitKeyFactory(
  partitionFactory: RateLimitPartitionFactory,
  options: PartitionedRateLimitKeyOptions = {},
): RateLimitKeyFactory {
  const includeTenant = options.includeTenant ?? true;
  const requireTenant = options.requireTenant ?? includeTenant;
  const onMissingPartition = options.onMissingPartition ?? 'throw';

  return (context) => {
    if (requireTenant && !context.tenantId) {
      throw new MissingRateLimitPartitionError(
        context.requestName,
        'tenant',
        'Set a tenantIdFactory on PipelineModule, or pass requireTenant: false ' +
          'for a single-tenant deployment.',
      );
    }

    const resolved = partitionFactory(context);
    const partition = typeof resolved === 'string' ? resolved.trim() : '';

    if (!partition) {
      if (onMissingPartition === 'throw') {
        throw new MissingRateLimitPartitionError(
          context.requestName,
          'caller',
          "Return a stable caller/account identifier, or configure onMissingPartition: 'request'.",
        );
      }
      // Shared bucket, but still inside the tenant partition when one is used,
      // so an anonymous caller in one tenant cannot exhaust another tenant's quota.
      return joinKeySegments([
        ...(includeTenant ? [context.tenantId] : []),
        context.requestName,
      ]);
    }

    return joinKeySegments([
      ...(includeTenant ? [context.tenantId] : []),
      partition,
      context.requestName,
    ]);
  };
}
