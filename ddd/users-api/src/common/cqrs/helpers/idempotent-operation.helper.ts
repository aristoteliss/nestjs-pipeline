/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { createHash } from 'node:crypto';
import { getSessionUserFromStore } from '@common/context/session-user.store';
import type { PrincipalType } from '@common/types/SessionUser';
import { getCaslAbility, getCaslPrincipal } from '@nestjs-pipeline/casl';
import { type IPipelineContext, stableStringify } from '@nestjs-pipeline/core';
import { createPartitionedIdempotencyKeyFactory } from '@nestjs-pipeline/idempotency';
import { requireTenantId } from './requireTenantId.helper';

/**
 * Namespace version for operation keys. Bump it only deliberately: a new
 * namespace abandons the deduplication claims stored under the previous one, so
 * an operation already completed can execute again until the old records expire.
 */
export const OPERATION_KEY_VERSION = 'v1';

/** Version of the replay-scope digest input, so its shape can change safely. */
const REPLAY_SCOPE_VERSION = 'v1';

/**
 * Raised when a protected operation cannot establish a trusted principal.
 *
 * A technical execution-context failure, not an HTTP or domain outcome.
 */
export class MissingPrincipalContextError extends Error {
  constructor(readonly purpose: string) {
    super(`Missing authenticated principal context for ${purpose}.`);
    this.name = MissingPrincipalContextError.name;
  }
}

/** Raised when a replay-scope digest cannot be derived. */
export class MissingReplayScopeContextError extends Error {
  constructor(readonly purpose: string) {
    super(`Missing authorization context for ${purpose}.`);
    this.name = MissingReplayScopeContextError.name;
  }
}

/** A principal established by authentication, never by the request payload. */
export interface TrustedPrincipal {
  tenantId: string;
  principalType: PrincipalType;
  id: string;
}

/**
 * The authenticated principal as `[principalType, id]`, or `undefined`.
 *
 * The identity comes from the request-scoped session established during
 * authentication — never from a body field a caller can set. An explicit
 * `principalType` is required: two different principals may share an id string,
 * and only the classification separates them.
 */
function trustedPrincipalSegments(): [PrincipalType, string] | undefined {
  const sessionUser = getSessionUserFromStore();
  const id = sessionUser?.id?.trim();
  const principalType = sessionUser?.principalType;

  return id && (principalType === 'user' || principalType === 'service')
    ? [principalType, id]
    : undefined;
}

/**
 * Resolves the authenticated principal for a protected operation, or fails closed.
 *
 * No placeholder such as `'anonymous'` is ever substituted: it would merge
 * unrelated callers into one namespace.
 */
export function requireTrustedPrincipal(
  ctx: IPipelineContext,
  purpose: string,
): TrustedPrincipal {
  const tenantId = requireTenantId(ctx, purpose);
  const principal = trustedPrincipalSegments();
  if (!principal) throw new MissingPrincipalContextError(purpose);

  const [principalType, id] = principal;
  return { tenantId, principalType, id };
}

/**
 * Key factory for the stable identity of one client operation.
 *
 * Built on the package's partitioned key helper, which escapes every segment and
 * fails closed when the tenant, principal or operation is missing. The key is
 * `v1:<tenant>:<principalType>:<principalId>:<action>:<discriminator>` and carries
 * nothing about permissions — an operation key that changed when permissions
 * changed would let the same side effect run a second time. Bind replay to the
 * caller's authorization with {@link replayScopeDigest} instead.
 *
 * The discriminator is a business identifier such as an email or a role name, so
 * this key deduplicates *that business object* for the configured TTL rather
 * than a single client request. A client-supplied `Idempotency-Key` contract is
 * a separate API decision.
 */
export function operationIdempotencyKeyFactory(
  action: string,
  discriminator: (ctx: IPipelineContext) => string | undefined,
): (ctx: IPipelineContext) => string {
  return createPartitionedIdempotencyKeyFactory({
    version: OPERATION_KEY_VERSION,
    action,
    principal: trustedPrincipalSegments,
    operation: discriminator,
  });
}

/**
 * Digest of the authorization scope a request runs under, for binding replay.
 *
 * Covers the effective ability rules in order — actions, subjects, fields,
 * inversion and condition values all contribute — together with the trusted
 * principal and the principal attributes those conditions interpolate. A change
 * to any of them yields a different digest, so a stored response is no longer
 * replayable to that caller.
 *
 * Fails closed when the ability or principal context is absent, which the
 * behavior evaluates before claiming the key.
 */
export function replayScopeDigest(
  ctx: IPipelineContext,
  purpose: string,
): string {
  const principal = requireTrustedPrincipal(ctx, purpose);
  const ability = getCaslAbility(ctx);
  if (!ability) throw new MissingReplayScopeContextError(purpose);

  const caslPrincipal = getCaslPrincipal(ctx);
  const digest = createHash('sha256')
    .update(
      stableStringify({
        principal,
        rules: ability.rules,
        // Condition templates resolve against these, so a change in the values
        // behind an unchanged rule still changes the effective authorization.
        context: caslPrincipal ?? null,
      }),
    )
    .digest('hex');

  return `${REPLAY_SCOPE_VERSION}:${digest}`;
}
