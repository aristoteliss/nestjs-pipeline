/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

import type { UserCapabilities } from '@nestjs-pipeline/casl';

/** Explicit identity kind used by authorization; never infer it from ID shape. */
export type PrincipalType = 'user' | 'service';

export type SessionUser = {
  id: string;
  /** Distinguishes persisted human users from service/machine principals. */
  principalType: PrincipalType;
  tenant: string;
  email?: string | null;
  department?: string | null;
  capabilities?: UserCapabilities;
  expiresAt?: number;
  exp?: number;
};

/** Shape of the Fastify secure-session data store. */
export interface SessionData {
  user?: SessionUser;
  api?: { id: string; tenant: string };
}

declare module '@fastify/secure-session' {
  interface SessionData {
    user?: SessionUser;
    api?: { id: string; tenant: string };
  }
}
