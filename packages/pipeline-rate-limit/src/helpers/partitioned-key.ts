/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { IPipelineContext } from '@nestjs-pipeline/core';
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
   * Include `context.tenantId` before the caller partition when one is present.
   * This prevents the same user/account identifier in two tenants from sharing
   * a limiter bucket accidentally.
   *
   * @default true
   */
  includeTenant?: boolean;

  /**
   * Behavior when the partition factory cannot resolve a non-empty identity.
   *
   * - `throw` — fail before consuming the limiter (recommended for per-caller
   *   security limits because silently falling back could merge callers).
   * - `request` — fall back to the package's historical request-level bucket,
   *   `context.requestName`.
   *
   * @default 'throw'
   */
  onMissingPartition?: 'throw' | 'request';
}

/**
 * Creates a reusable {@link RateLimitKeyFactory} for per-caller limits without
 * changing the package's existing default key behavior.
 *
 * `RateLimitBehavior` intentionally keeps `context.requestName` as its default
 * bucket so upgrading this package remains backward-compatible. Applications
 * that actually mean "N requests per user/account" can opt into this helper and
 * make the partition explicit instead of repeatedly hand-building string keys.
 *
 * The produced key is:
 *
 * - `<tenantId>:<partition>:<requestName>` when tenant inclusion is enabled and
 *   a tenant exists;
 * - `<partition>:<requestName>` otherwise.
 *
 * `RateLimitBehaviorOptions.keyPrefix` is still applied afterwards by
 * `buildRateLimitKey()`, so environment/service prefixes remain orthogonal.
 *
 * @example Per authenticated user, tenant-aware by default
 * ```ts
 * const perUserKey = createPartitionedRateLimitKeyFactory((ctx) =>
 *   ctx.items.get('currentUserId') as string | undefined,
 * );
 *
 * @UsePipeline([RateLimitBehavior, {
 *   keyFactory: perUserKey,
 *   keyPrefix: 'write-api',
 * }])
 * export class CreateOrderHandler {}
 * ```
 *
 * For tenant `acme`, user `u-123`, and `CreateOrderCommand`, the final key is
 * `write-api:acme:u-123:CreateOrderCommand`.
 *
 * @example Account-wide bucket shared by every user in the account
 * ```ts
 * const perAccountKey = createPartitionedRateLimitKeyFactory(
 *   (ctx) => ctx.items.get('accountId') as string | undefined,
 *   { includeTenant: false },
 * );
 * ```
 *
 * @example Optional identity with historical request-bucket fallback
 * ```ts
 * const keyFactory = createPartitionedRateLimitKeyFactory(
 *   (ctx) => ctx.items.get('apiClientId') as string | undefined,
 *   { onMissingPartition: 'request' },
 * );
 * ```
 */
export function createPartitionedRateLimitKeyFactory(
  partitionFactory: RateLimitPartitionFactory,
  options: PartitionedRateLimitKeyOptions = {},
): RateLimitKeyFactory {
  const includeTenant = options.includeTenant ?? true;
  const onMissingPartition = options.onMissingPartition ?? 'throw';

  return (context) => {
    const resolved = partitionFactory(context);
    const partition = typeof resolved === 'string' ? resolved.trim() : '';

    if (!partition) {
      if (onMissingPartition === 'request') return context.requestName;
      throw new TypeError(
        `Rate-limit partition factory returned no identity for ${context.requestName}. ` +
          "Return a stable caller/account identifier or configure onMissingPartition: 'request'.",
      );
    }

    const parts: string[] = [];
    if (includeTenant && context.tenantId) parts.push(context.tenantId);
    parts.push(partition, context.requestName);
    return parts.join(':');
  };
}
