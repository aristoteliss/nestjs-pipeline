/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import type { UserCapabilities } from '@nestjs-pipeline/casl';

/** Explicit principal classification. Authorization must never infer this from the id format. */
export type PrincipalType = 'user' | 'service';

export type SessionUser = {
  id: string;
  /**
   * Authentication-source classification consumed by authorization.
   *
   * Kept optional at the transport/session boundary so stale serialized sessions
   * can still be deserialized. Authorization fails closed when the value is absent.
   */
  principalType?: PrincipalType;
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
