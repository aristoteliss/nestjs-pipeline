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
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import type { SessionData, SessionUser } from '../../common/types/SessionUser';
import { ApiClientAuthenticator } from './api-client-authenticator';
import { JwtAuthenticator } from './jwt-authenticator';

export type AuthenticatedRequest = {
  headers?: Record<string, string | string[] | undefined>;
  session?: Session<SessionData>;
  sessionUser?: SessionUser;
};

/**
 * Orchestrates inbound authentication and assigns an explicit principal type at
 * the credential boundary. Authorization code must never infer identity kind
 * from the textual shape of `id`.
 *
 * Source mapping:
 * - authenticated browser/session and Bearer JWT -> `principalType: 'user'`
 * - API client credentials -> `principalType: 'service'`
 */
@Injectable()
export class RequestPrincipalResolver {
  constructor(
    private readonly jwtAuthenticator: JwtAuthenticator,
    private readonly apiClientAuthenticator: ApiClientAuthenticator,
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) {}

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
        // Secure browser sessions are user sessions. Preserve an explicit type
        // when already present (for example the E2E service-principal shim).
        return {
          ...existingUser,
          principalType: existingUser.principalType ?? 'user',
        };
      }
    }

    const jwtUser = await this.jwtAuthenticator.authenticate(req);
    if (jwtUser) {
      return { ...jwtUser, principalType: 'user' };
    }

    const apiClient = this.apiClientAuthenticator.authenticate(req);
    return apiClient ? { ...apiClient, principalType: 'service' } : undefined;
  }

  /** Validates that credential tenant matches the active request schema. */
  assertCurrentTenant(credentialTenant: string): void {
    if (credentialTenant !== this.tenantSchemaContext.schema) {
      throw new UnauthorizedException(
        'Credential tenant does not match the selected tenant',
      );
    }
  }
}
