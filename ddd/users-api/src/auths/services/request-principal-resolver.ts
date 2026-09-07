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

import type { Session } from '@fastify/secure-session';
import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '@common/context/tenant-context.port';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SessionData, SessionUser } from '../../common/types/SessionUser';
import { ApiClientAuthenticator } from './api-client-authenticator';
import { JwtAuthenticator } from './jwt-authenticator';

export type AuthenticatedRequest = {
  headers?: Record<string, string | string[] | undefined>;
  session?: Session<SessionData>;
  sessionUser?: SessionUser;
};

/**
 * Orchestrates inbound authentication across session, JWT and API-client mechanisms.
 * Tenant matching is performed through {@link ITenantContext}, keeping this
 * application service independent from the persistence implementation.
 */
@Injectable()
export class RequestPrincipalResolver {
  constructor(
    private readonly jwtAuthenticator: JwtAuthenticator,
    private readonly apiClientAuthenticator: ApiClientAuthenticator,
    @Inject(TENANT_CONTEXT)
    private readonly tenantContext: ITenantContext,
  ) {}

  /** Resolves the authenticated principal for the incoming request. */
  async resolvePrincipal(
    req: AuthenticatedRequest,
  ): Promise<SessionUser | undefined> {
    const existingUser = req.session?.user;
    if (existingUser) {
      const now = Date.now();
      const isExpired =
        (typeof existingUser.expiresAt === 'number' &&
          existingUser.expiresAt <= now) ||
        (typeof existingUser.exp === 'number' &&
          existingUser.exp * 1000 <= now);

      if (isExpired) {
        if (typeof req.session?.delete === 'function') {
          req.session.delete();
        } else if (req.session) {
          delete req.session.user;
        }
      } else {
        this.assertCurrentTenant(existingUser.tenant);
        return existingUser;
      }
    }

    const jwtUser = await this.jwtAuthenticator.authenticate(req);
    if (jwtUser) {
      return jwtUser;
    }

    return this.apiClientAuthenticator.authenticate(req);
  }

  /** Ensures the credential tenant matches the active execution tenant. */
  assertCurrentTenant(credentialTenant: string): void {
    if (credentialTenant !== this.tenantContext.schema) {
      throw new UnauthorizedException(
        'Credential tenant does not match the selected tenant',
      );
    }
  }
}
