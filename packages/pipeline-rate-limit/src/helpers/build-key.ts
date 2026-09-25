/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { escapeKeySegment } from '@cqrs-ddd/safe-stringify';
import { type IPipelineContext } from '@nestjs-pipeline/core';
import type { RateLimitBehaviorOptions } from '../interfaces/rate-limit-options.interface';

/**
 * Resolve the rate-limit bucket key for a request.
 *
 * A `keyFactory` is required. There is deliberately no default: the obvious one —
 * `context.requestName` — is a bucket shared by every caller of that request
 * across every tenant, so one abusive client locks out everybody. A limiter whose
 * default configuration turns one abuser into a full outage is worse than no
 * limiter, because it looks like protection.
 *
 * Callers that genuinely want an application-wide operation bucket say so:
 *
 * ```ts
 * { keyFactory: (ctx) => ctx.requestName }
 * ```
 *
 * `options.keyPrefix` is prepended as `"<prefix>:<key>"` when provided, so
 * environment and service prefixes stay orthogonal to the partitioning choice.
 *
 * @param context - The pipeline context of the current request.
 * @param options - Effective behavior options.
 * @throws {TypeError} When no `keyFactory` is configured.
 */
export function buildRateLimitKey(
  context: IPipelineContext,
  options: RateLimitBehaviorOptions = {},
): string {
  if (!options.keyFactory) {
    throw new TypeError(
      `RateLimitBehavior on ${context.handlerName} requires an explicit keyFactory. ` +
        'A request-name-only bucket is shared by every caller in every tenant, so a ' +
        'single client can exhaust it for all of them. Use ' +
        'createPartitionedRateLimitKeyFactory(...) for per-caller limits, or pass ' +
        'keyFactory: (ctx) => ctx.requestName to accept a global bucket deliberately.',
    );
  }

  const base = options.keyFactory(context);
  // Only the prefix is escaped. `base` is already a complete key — a partitioned
  // factory has escaped its own segments — so re-escaping it here would mangle
  // the documented "<prefix>:<key>" shape.
  return options.keyPrefix
    ? `${escapeKeySegment(options.keyPrefix)}:${base}`
    : base;
}
