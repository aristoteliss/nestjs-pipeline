/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { stableStringify } from '@cqrs-ddd/safe-stringify';
import type { IPipelineContext } from '@nestjs-pipeline/core';
import { MissingAbilityError } from '../errors/missing-ability.error.js';
import { getCaslAbility } from './authorizer.js';

/**
 * A digest of the permissions the current ability grants: the SHA-256 (hex) of
 * its rules in order, with every condition already resolved against the
 * principal. Any change that can change a decision — a rule, its order,
 * inversion, fields, or a principal value a condition interpolates — changes
 * the digest.
 *
 * Use it as the permission-scope segment of a response cache key, or as an
 * idempotency replay scope. It identifies a set of permissions, not a caller:
 * two principals with identical effective rules share a digest, so combine it
 * with the principal wherever the key must separate callers.
 *
 * @param context - The pipeline execution; omitted, the running one.
 * @returns The 64-character hex digest, or `undefined` when no ability is
 *   present (`CaslBehavior` has not run, or runs outside a pipeline).
 * @throws {TypeError} When a rule holds a value that is not plain JSON, such as
 *   a `RegExp` condition.
 *
 * @example
 * ```ts
 * const cacheKey = createPartitionedCacheKeyFactory({
 *   principal: (ctx) => getCaslPrincipal(ctx)?.id,
 *   scope: abilityDigest,
 * });
 * const replay = idempotent({ keyFactory, replayScopeFactory: abilityDigest });
 * ```
 */
export function abilityDigest(context?: IPipelineContext): string | undefined {
  const ability = getCaslAbility(context);
  if (!ability) return undefined;
  return createHash('sha256')
    .update(stableStringify(ability.rules))
    .digest('hex');
}

/**
 * {@link abilityDigest}, failing closed: it throws instead of returning
 * `undefined` when no ability is present. Use it where a missing ability must
 * stop the operation, such as an idempotency replay scope, whose factory must
 * throw rather than let an operation run without a scope.
 *
 * @param context - The pipeline execution; omitted, the running one.
 * @returns The 64-character hex digest.
 * @throws {MissingAbilityError} When no ability is present.
 * @throws {TypeError} When a rule holds a value that is not plain JSON.
 *
 * @example
 * ```ts
 * idempotent({ keyFactory, replayScopeFactory: requireAbilityDigest });
 * ```
 */
export function requireAbilityDigest(context?: IPipelineContext): string {
  const digest = abilityDigest(context);
  if (digest === undefined) {
    throw new MissingAbilityError('an authorization digest');
  }
  return digest;
}
