/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getSessionPrincipal } from '@common/context/session-principal.store.js';
import type {
  AuditActor,
  AuditBehaviorOptions,
} from '@cqrs-ddd/pipeline-audit';

/**
 * Actor recorded when no authenticated principal is in scope.
 *
 * Carries no `id`: an audit record must not be readable as if an identified
 * principal performed the action.
 */
const UNAUTHENTICATED_AUDIT_ACTOR: AuditActor = Object.freeze({
  authenticated: false,
});

/**
 * Resolve the acting principal from the authenticated session context.
 *
 * Reads the request-scoped session established by
 * `SessionPrincipalContextInterceptor`, never the request payload: a caller-supplied
 * field must not populate an identity that audit consumers read as
 * authenticated.
 *
 * @returns The acting principal, or {@link UNAUTHENTICATED_AUDIT_ACTOR} when the
 * request carries no session principal.
 */
export function sessionAuditActor(): AuditActor {
  const sessionPrincipal = getSessionPrincipal();
  if (!sessionPrincipal) return UNAUTHENTICATED_AUDIT_ACTOR;

  return {
    id: sessionPrincipal.id,
    authenticated: true,
    principalType: sessionPrincipal.type,
    email: sessionPrincipal.email ?? undefined,
  };
}

/**
 * Actor for a pre-authentication command, where the caller has supplied an
 * identity but nothing has verified it yet.
 *
 * The claimed value is recorded as `claimedEmail`, never as `id`: audit
 * consumers read `id` as an identified principal, and `authenticated` stays
 * `false` so such a record cannot pass a filter for trusted activity. An
 * absent claim is expressed by the field being absent, not by a placeholder.
 */
export function claimedIdentityActor(claimedEmail?: string): AuditActor {
  return claimedEmail
    ? { ...UNAUTHENTICATED_AUDIT_ACTOR, claimedEmail }
    : UNAUTHENTICATED_AUDIT_ACTOR;
}

/**
 * Module-wide audit defaults for the application, merged under each handler's
 * own options.
 *
 * Handlers declare the action, severity and target metadata; the acting
 * principal is resolved here once so no handler has to reimplement it.
 */
export const AUDIT_MODULE_DEFAULTS = {
  actor: sessionAuditActor,
} satisfies AuditBehaviorOptions;
