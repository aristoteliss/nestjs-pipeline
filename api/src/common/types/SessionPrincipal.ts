/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability } from '@nestjs-pipeline/casl';

/** Explicit principal classification. Authorization must never infer this from the id format. */
export type PrincipalType = 'user' | 'service';

/**
 * Whether `value` is a {@link PrincipalType}. Use it on data read back from a
 * session cookie, which is not guaranteed to match `SessionUser`.
 *
 * @example
 * ```ts
 * if (!isPrincipalType(req.session?.user?.principalType)) {
 *   this.sessionService.discard(req.session);
 * }
 * ```
 */
export function isPrincipalType(value: unknown): value is PrincipalType {
  return value === 'user' || value === 'service';
}

export function isSessionPrincipalValid(
  sessionPrincipal: SessionPrincipal | undefined,
): boolean {
  return (
    sessionPrincipal?.id?.trim() != null &&
    isPrincipalType(sessionPrincipal.type)
  );
}

export type SessionPrincipal = {
  id: string;
  /** Authentication source classification used by authorization. */
  type: PrincipalType;
  tenant: string;
  /** Login session (`Auth` id) of a user access token. */
  sid?: string;
  email?: string | null;
  department?: string | null;
  /** Absent: a user's rules are read from persistence; a service principal has none. */
  grants?: Capability[];
  expiresAt?: number;
  exp?: number;
};

/** Shape of the Fastify secure-session data store. */
export interface SessionData {
  user?: SessionPrincipal;
  token?: string;
}

declare module '@fastify/secure-session' {
  interface SessionData {
    user?: SessionPrincipal;
    token?: string;
  }
}
