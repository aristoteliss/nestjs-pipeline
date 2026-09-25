/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { joinKeySegments, stableStringify } from '@cqrs-ddd/safe-stringify';
import { type IPipelineContext } from '@nestjs-pipeline/core';
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

  /**
   * Whether a missing authorization scope is an error rather than an omitted segment.
   *
   * Set to `false` only when responses do not depend on the caller's permissions;
   * `scope` may then be omitted.
   *
   * @default true
   */
  requireScope?: boolean;
}

/** Deterministic digest of the request payload, so secrets stay out of key listings. */
function digestRequest(request: unknown): string {
  return createHash('sha256').update(stableStringify(request)).digest('hex');
}

/**
 * Builds a cache key that partitions every dimension capable of changing an
 * authorized response.
 *
 * The key includes tenant, principal, optional permission scope, request type,
 * and a SHA-256 digest of the request payload. This keeps raw request data out
 * of cache key listings while preventing authorized responses from being shared
 * across callers with different security context.
 *
 * Use this helper when a cache hit can bypass authorization or response
 * filtering performed inside the handler.
 *
 * @param options - Resolvers and fail-closed requirements for key partitioning.
 * @returns A `CacheKeyFactory` suitable for `CacheBehaviorOptions.key`.
 * @throws {TypeError} When `requireScope` is not `false` and no `scope` resolver is given.
 * @throws {MissingCachePartitionError} (from the returned factory) When a required
 *   tenant, principal or scope is absent.
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
 *   requireScope: false,
 * });
 * ```
 */
export function createPartitionedCacheKeyFactory(
  options: PartitionedCacheKeyOptions,
): CacheKeyFactory {
  const requireTenant = options.requireTenant ?? true;
  const requirePrincipal = options.requirePrincipal ?? true;
  const requireScope = options.requireScope ?? true;
  if (requireScope && !options.scope) {
    throw new TypeError(
      'createPartitionedCacheKeyFactory requires a `scope` resolver: a cache hit ' +
        'skips the handler, so a response computed under revoked permissions would ' +
        'keep being served. Pass requireScope: false when responses do not depend ' +
        "on the caller's permissions.",
    );
  }

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

    if (requireScope && !scope) {
      throw new MissingCachePartitionError(
        context.requestName,
        'scope',
        'A cache hit skips the handler and therefore its entity-level ' +
          'authorization. Return the authorization scope, or pass ' +
          'requireScope: false when responses are scope-independent.',
      );
    }

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
