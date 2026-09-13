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

import { createHash } from 'node:crypto';
import { type IPipelineContext, stableStringify } from '@nestjs-pipeline/core';

/**
 * Security-safe default cache-key factory.
 *
 * The built-in key is request-scoped through `correlationId`, preventing a
 * cached response from one authenticated request from being replayed into a
 * different principal/permission context. Tenant ID and request name are
 * retained for observability/collision partitioning.
 *
 * The request payload is represented by a deterministic SHA-256 digest instead
 * of embedding `stableStringify(context.request)` verbatim. This keeps secrets,
 * search terms, email addresses and other request data out of Redis/Keyv key
 * listings while also bounding the payload-derived portion of the key.
 *
 * Applications that intentionally want cross-request/shared caching must supply
 * an explicit `CacheBehaviorOptions.key` that includes every authorization
 * dimension capable of changing the result (for example tenant, principal and
 * permission/role scope).
 *
 * @example Shared cache partitioned by tenant + principal
 * ```ts
 * @UsePipeline([CacheBehavior, {
 *   key: (ctx) => {
 *     const userId = ctx.items.get('userId') as string;
 *     return `user:${ctx.tenantId}:${userId}:${ctx.requestName}:${stableHash(ctx.request)}`;
 *   },
 * }])
 * ```
 *
 * The built-in format is versioned (`cache:v2:`) so future key-format changes
 * can intentionally create a cold cache instead of colliding with old entries.
 */
export function defaultCacheKey(context: IPipelineContext): string {
  const tenantPrefix = context.tenantId ? `${context.tenantId}:` : '';
  const digest = createHash('sha256')
    .update(stableStringify(context.request))
    .digest('hex');

  return `cache:v2:${tenantPrefix}${context.correlationId}:${context.requestName}:${digest}`;
}
