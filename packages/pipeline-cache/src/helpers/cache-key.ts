/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import {
  type IPipelineContext,
  joinKeySegments,
  stableStringify,
} from '@nestjs-pipeline/core';
import { MissingCachePartitionError } from '../errors/missing-partition.error';
import type { CacheKeyFactory } from '../interfaces/cache-options.interface';

/** Key format version. Bump to make a format change produce a cold cache. */
const KEY_VERSION = 'v3';

/** Options for {@link createPartitionedCacheKeyFactory}. */
export interface PartitionedCacheKeyOptions {
  /**
   * Resolves the principal the response is scoped to.
   *
   * Required whenever the handler performs entity-level authorization or field
   * filtering, because a cache hit skips the handler entirely — and therefore
   * skips those checks.
   */
  principal: (context: IPipelineContext) => string | undefined;

  /**
   * Resolves a fingerprint of the caller's permission scope — a role-set hash or
   * a capability version.
   *
   * Without it, a principal whose roles change keeps reading responses computed
   * under the old permissions until the entry expires.
   */
  scope?: (context: IPipelineContext) => string | undefined;

  /**
   * Whether a missing tenant is an error rather than an omitted segment.
   *
   * @default true
   */
  requireTenant?: boolean;

  /**
   * Whether a missing principal is an error.
   *
   * Set to `false` only for genuinely public, identical-for-everyone responses.
   *
   * @default true
   */
  requirePrincipal?: boolean;
}

/** Deterministic digest of the request payload, so secrets stay out of key listings. */
function digestRequest(request: unknown): string {
  return createHash('sha256').update(stableStringify(request)).digest('hex');
}

/**
 * Builds a cache key that partitions every dimension capable of changing an
 * authorized response.
 *
 * `CacheBehavior` has no default key on purpose. The previous default included
 * `context.correlationId`, which is unique per request — so the cache wrote an
 * entry for every query and could never read one back. It cost two round-trips
 * and unbounded store growth while delivering no hits at all, and it only looked
 * safe: a client can supply its own correlation ID, and nested executions
 * deliberately inherit one, so it never was an authorization boundary either.
 *
 * Requiring an explicit factory turns that into a decision made once, in the
 * open, instead of a silent default that is either useless or unsafe.
 *
 * @example Per principal, tenant-aware, invalidated when roles change
 * ```ts
 * @UsePipeline([CacheBehavior, {
 *   key: createPartitionedCacheKeyFactory({
 *     principal: (ctx) => ctx.items.get('currentUserId') as string | undefined,
 *     scope: (ctx) => ctx.items.get('capabilityVersion') as string | undefined,
 *   }),
 * }])
 * export class GetUsersHandler {}
 * ```
 *
 * @example Public reference data, identical for every caller
 * ```ts
 * createPartitionedCacheKeyFactory({
 *   principal: () => 'public',
 *   requirePrincipal: false,
 *   requireTenant: false,
 * });
 * ```
 */
export function createPartitionedCacheKeyFactory(
  options: PartitionedCacheKeyOptions,
): CacheKeyFactory {
  const requireTenant = options.requireTenant ?? true;
  const requirePrincipal = options.requirePrincipal ?? true;

  return (context) => {
    if (requireTenant && !context.tenantId) {
      throw new MissingCachePartitionError(
        context.requestName,
        'tenant',
        'Set a tenantIdFactory on PipelineModule, or pass requireTenant: false ' +
          'for a single-tenant deployment.',
      );
    }

    const resolvedPrincipal = options.principal(context);
    const principal =
      typeof resolvedPrincipal === 'string' ? resolvedPrincipal.trim() : '';

    if (requirePrincipal && !principal) {
      throw new MissingCachePartitionError(
        context.requestName,
        'principal',
        'A cache hit skips the handler and therefore its entity-level ' +
          'authorization. Return the authenticated principal, or pass ' +
          'requirePrincipal: false for a genuinely public response.',
      );
    }

    const resolvedScope = options.scope?.(context);
    const scope =
      typeof resolvedScope === 'string' && resolvedScope.trim()
        ? resolvedScope.trim()
        : undefined;

    return joinKeySegments([
      'cache',
      KEY_VERSION,
      context.tenantId,
      principal || undefined,
      scope,
      context.requestName,
      digestRequest(context.request),
    ]);
  };
}
