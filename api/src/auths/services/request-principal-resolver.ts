/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { requireTenant } from '@cqrs-ddd/core/application';
import type { Session } from '@fastify/secure-session';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  isPrincipalType,
  type SessionData,
  type SessionPrincipal,
} from '../../common/types/session-principal.js';
import { ApiClientAuthenticator } from './api-client-authenticator.js';
import { JwtAuthenticator } from './jwt-authenticator.js';
import { SessionService } from './session.service.js';

export type AuthenticatedRequest = {
  headers?: Record<string, string | string[] | undefined>;
  session?: Session<SessionData>;
  sessionPrincipal?: SessionPrincipal;
};

@Injectable()
export class RequestPrincipalResolver {
  constructor(
    private readonly jwtAuthenticator: JwtAuthenticator,
    private readonly apiClientAuthenticator: ApiClientAuthenticator,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Resolves the request's principal from the first credential present: the
   * Fastify session cookie, then an `Authorization: Bearer` token, then the
   * `x-api-id`/`x-api-key` headers. A session cookie that has expired or has no
   * `sid` or principal type is cleared and skipped.
   *
   * @param req - The incoming request.
   * @returns The principal, or `undefined` for a request without credentials.
   * @throws UnauthorizedException for a credential that is invalid, expired or
   *   issued for another tenant.
   *
   * @example
   * ```ts
   * req.sessionPrincipal = await this.principalResolver.resolvePrincipal(req);
   * ```
   */
  async resolvePrincipal(
    req: AuthenticatedRequest,
  ): Promise<SessionPrincipal | undefined> {
    const existingUser = req.session?.user;
    if (existingUser) {
      if (
        this.sessionService.isExpired(existingUser) ||
        !isPrincipalType(existingUser.type) ||
        typeof existingUser.sid !== 'string' ||
        existingUser.sid.trim().length === 0
      ) {
        this.sessionService.discard(req.session);
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

  private assertCurrentTenant(credentialTenant: string): void {
    if (credentialTenant !== requireTenant('the credential tenant check')) {
      throw new UnauthorizedException(
        'Credential tenant does not match the selected tenant',
      );
    }
  }
}
