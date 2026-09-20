/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { getSessionUserFromStore } from '@common/context/session-user.store';
import type { AuditActor, AuditBehaviorOptions } from '@nestjs-pipeline/audit';

/**
 * Actor recorded when no authenticated principal is in scope.
 *
 * Carries no `id`: an audit record must not be readable as if an identified
 * principal performed the action.
 */
export const UNAUTHENTICATED_AUDIT_ACTOR: AuditActor = Object.freeze({
  authenticated: false,
});

/**
 * Resolve the acting principal from the authenticated session context.
 *
 * Reads the request-scoped session established by
 * `SessionUserContextInterceptor`, never the request payload: a caller-supplied
 * field must not populate an identity that audit consumers read as
 * authenticated.
 *
 * @returns The acting principal, or {@link UNAUTHENTICATED_AUDIT_ACTOR} when the
 * request carries no session principal.
 */
export function sessionAuditActor(): AuditActor {
  const sessionUser = getSessionUserFromStore();
  if (!sessionUser) return UNAUTHENTICATED_AUDIT_ACTOR;

  return {
    id: sessionUser.id,
    authenticated: true,
    principalType: sessionUser.principalType,
    email: sessionUser.email ?? undefined,
  };
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
