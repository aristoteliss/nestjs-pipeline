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
import type { RateLimitBehaviorOptions } from '../interfaces/rate-limit-options.interface';

/**
 * Resolve the rate-limit bucket key for a request.
 *
 * Uses `options.keyFactory` when set, otherwise `context.requestName`, and
 * prepends `options.keyPrefix` as `"<prefix>:<key>"` when provided.
 *
 * @param context - The pipeline context of the current request.
 * @param options - Effective behavior options.
 */
export function buildRateLimitKey(
  context: IPipelineContext,
  options: RateLimitBehaviorOptions = {},
): string {
  const base = options.keyFactory
    ? options.keyFactory(context)
    : context.requestName;
  return options.keyPrefix ? `${options.keyPrefix}:${base}` : base;
}
