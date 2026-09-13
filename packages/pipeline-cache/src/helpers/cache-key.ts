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

import { type IPipelineContext, stableStringify } from '@nestjs-pipeline/core';

/**
 * Security-safe default cache-key factory.
 *
 * The built-in key is request-scoped through `correlationId`, preventing a
 * cached response from one authenticated request from being replayed into a
 * different principal/permission context. Tenant ID, request name, and stable
 * request serialization are retained for observability and collision safety.
 *
 * Applications that intentionally want cross-request/shared caching must supply
 * an explicit `CacheBehaviorOptions.key` that includes every authorization
 * dimension capable of changing the result (for example tenant, principal and
 * permission/role scope).
 */
export function defaultCacheKey(context: IPipelineContext): string {
  const tenantPrefix = context.tenantId ? `${context.tenantId}:` : '';
  return `${tenantPrefix}${context.correlationId}:${context.requestName}:${stableStringify(
    context.request,
  )}`;
}
