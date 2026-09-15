/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
