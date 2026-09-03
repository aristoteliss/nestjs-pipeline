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
 * Orchestrates inbound authentication across multiple authentication mechanisms.
 *
 * Evaluation follows strict priority:
 * 1. Fastify session cookie (`req.session?.user`) — fast path for web browser sessions.
 * 2. Bearer JWT header (`Authorization: Bearer <token>`) via {@link JwtAuthenticator}.
 * 3. Machine API client credentials (`x-api-id` / `x-api-key`) via {@link ApiClientAuthenticator}.
 * 4. Anonymous caller fallback (returns `undefined`).
 *
 * Injected by {@link AuthSessionGuard} to authenticate callers early in the NestJS request lifecycle.
 *
 * @example
 * ```ts
 * // Typical usage inside a guard
 * const principal = await principalResolver.resolvePrincipal(req);
 * if (principal) {
 *   req.sessionUser = principal;
 * }
 * ```
 */
@Injectable()
export class RequestPrincipalResolver {
  constructor(
    private readonly jwtAuthenticator: JwtAuthenticator,
    private readonly apiClientAuthenticator: ApiClientAuthenticator,
  ) {}

  /**
   * Resolves the authenticated {@link SessionUser} principal for the incoming request.
   *
   * @param req - Incoming HTTP request containing optional session cookie or headers.
   * @returns The resolved {@link SessionUser}, or `undefined` for anonymous requests.
   * @throws {@link UnauthorizedException} If credentials are supplied but expired, malformed,
   *         or belong to a tenant different from the currently active tenant schema.
   *
   * @example
   * ```ts
   * const user = await resolver.resolvePrincipal(req);
   * console.log(user?.id, user?.tenant);
   * ```
   */
  async resolvePrincipal(
    req: AuthenticatedRequest,
  ): Promise<SessionUser | undefined> {
    const existingUser = req.session?.user;
    if (existingUser) {
      this.assertCurrentTenant(existingUser.tenant);
      return existingUser;
    }

    const jwtUser = await this.jwtAuthenticator.authenticate(req);
    if (jwtUser) {
      if (req.session) {
        req.session.user = jwtUser;
      }
      return jwtUser;
    }

    return this.apiClientAuthenticator.authenticate(req);
  }

  /**
   * Validates that the tenant declared in credentials matches the active request schema.
   *
   * @param credentialTenant - Tenant schema identifier extracted from credentials.
   * @throws {@link UnauthorizedException} If `credentialTenant` does not match {@link TenantSchemaContext.currentSchema}.
   *
   * @example
   * ```ts
   * resolver.assertCurrentTenant('tenant_a'); // Passes if active schema is 'tenant_a', throws 401 otherwise
   * ```
   */
  assertCurrentTenant(credentialTenant: string): void {
    if (credentialTenant !== TenantSchemaContext.currentSchema) {
      throw new UnauthorizedException(
        'Credential tenant does not match the selected tenant',
      );
    }
  }
}
