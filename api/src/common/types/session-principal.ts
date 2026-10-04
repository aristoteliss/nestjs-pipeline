/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability } from '@cqrs-ddd/pipeline-casl';

/** Explicit principal classification. Authorization must never infer this from the id format. */
export type PrincipalType = 'user' | 'service';

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
  /** When the credential stops authenticating. A session-cookie principal without it counts as expired. */
  expiresAt?: number;
};

declare module '@fastify/secure-session' {
  interface SessionData {
    user?: SessionPrincipal;
    token?: string;
  }
}

/** Shape of the secure-session data store. */
export type { SessionData } from '@fastify/secure-session';

/**
 * Whether `value` is a {@link PrincipalType}. Use it on data read back from a
 * session cookie, which is not guaranteed to match {@link SessionPrincipal}.
 *
 * @example
 * ```ts
 * if (!isPrincipalType(req.session?.user?.type)) {
 *   this.sessionService.discard(req.session);
 * }
 * ```
 */
export function isPrincipalType(value: unknown): value is PrincipalType {
  return value === 'user' || value === 'service';
}

/**
 * The identity of a principal as key segments `[type, id]`: the one check of
 * whether a principal is identified, shared by authorization and by every
 * cache, idempotency and rate-limit key. The id must be a non-blank string and
 * is trimmed; the type must be a {@link PrincipalType}, because two principals
 * of different types may share an id.
 *
 * @param principal - A session principal, or any value carrying `id` and
 *   `type`, such as a CASL principal mapped to that shape.
 * @returns The segments, or `undefined` when the principal is absent or not
 *   identified.
 *
 * @example
 * ```ts
 * principalSegments({ id: ' u-1 ', type: 'user' }); // ['user', 'u-1']
 * principalSegments({ id: '', type: 'user' }); // undefined
 * ```
 */
export function principalSegments(
  principal: { readonly id?: unknown; readonly type?: unknown } | undefined,
): [PrincipalType, string] | undefined {
  const id = typeof principal?.id === 'string' ? principal.id.trim() : '';
  const type = principal?.type;
  return id && isPrincipalType(type) ? [type, id] : undefined;
}

/**
 * Whether `principal` is identified, by the rule of {@link principalSegments}.
 *
 * @example
 * ```ts
 * const session = getSessionPrincipal();
 * if (!isSessionPrincipalValid(session)) return null;
 * ```
 */
export function isSessionPrincipalValid(
  principal: SessionPrincipal | undefined,
): principal is SessionPrincipal {
  return principalSegments(principal) !== undefined;
}
