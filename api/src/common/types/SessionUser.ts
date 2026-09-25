/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { Capability } from '@nestjs-pipeline/casl';

/** Explicit principal classification. Authorization must never infer this from the id format. */
export type PrincipalType = 'user' | 'service';

/** Whether `value` is a {@link PrincipalType}, for data read back from a session cookie. */
export function isPrincipalType(value: unknown): value is PrincipalType {
  return value === 'user' || value === 'service';
}

export type SessionUser = {
  id: string;
  /** Authentication source classification used by authorization. */
  principalType: PrincipalType;
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
