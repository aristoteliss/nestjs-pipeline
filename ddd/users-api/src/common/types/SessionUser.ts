/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability } from '@nestjs-pipeline/casl';

/** Explicit principal classification. Authorization must never infer this from the id format. */
export type PrincipalType = 'user' | 'service';

export type SessionUser = {
  id: string;
  /**
   * Authentication source classification used by authorization.
   *
   * Kept optional at the transport type boundary so stale sessions can still be
   * deserialized, but authorization deliberately rejects principals that do not
   * carry an explicit value.
   */
  principalType?: PrincipalType;
  tenant: string;
  /** Login session (`Auth` id) of a user access token. */
  sid?: string;
  email?: string | null;
  department?: string | null;
  /** Authorization rules attached by the authenticator (service principals). */
  grants?: Capability[];
  expiresAt?: number;
  exp?: number;
};

/** Shape of the Fastify secure-session data store. */
export interface SessionData {
  user?: SessionUser;
  token?: string;
  api?: { id: string; tenant: string };
}

declare module '@fastify/secure-session' {
  interface SessionData {
    user?: SessionUser;
    token?: string;
    api?: { id: string; tenant: string };
  }
}
