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
import { Inject, Injectable } from '@nestjs/common';
import type { UserCapabilities } from '@nestjs-pipeline/casl';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import type { SessionData } from '../../common/types/SessionUser';
import { GetUserQuery } from '../../users/cqrs/queries/get-user.query';
import { User } from '../../users/domain/models/user.entity';
import { EXT_USER_QUERY_REPOSITORY } from '../../users/persistence/repository.tokens';
import {
  ACCESS_TOKEN_ISSUER,
  type IAccessTokenIssuer,
  type ILoginCodeVerifier,
  LOGIN_CODE_VERIFIER,
} from '../application/authentication.ports';
import { GetUserCapabilitiesQuery } from '../cqrs/queries/get-user-capabilities.query';
import { InvalidLoginCredentialsException } from '../domain/errors/authentication.exception';
import { QUERY_REPOSITORY } from '../persistence/repository.tokens';
import { JwtAuthenticator } from './jwt-authenticator';
import { SessionService } from './session.service';

export interface AuthResult {
  userId: string;
  userCapabilities: UserCapabilities;
  accessToken: string;
  expiresAt?: number;
  exp?: number;
}

/**
 * Application service responsible for user login verification and access token issuance.
 *
 * Encapsulates the `POST /auth/login` workflow:
 * 1. Validates the temporary login code via {@link ILoginCodeVerifier}.
 * 2. Fetches user account details from the tenant database via {@link GetUserQuery}.
 * 3. Resolves CASL user permissions and role capabilities via {@link IQueryRepository}.
 * 4. Signs an access token via {@link IAccessTokenIssuer}.
 *
 * Infrastructure details like cryptography, JWT libraries, and environment variables
 * remain cleanly behind application ports.
 *
 * @example
 * ```bash
 * # Initiating login
 * curl -X POST https://api.example.com/auth/login \
 *   -H "x-tenant-schema: tenant_a" \
 *   -H "Content-Type: application/json" \
 *   -d '{"email":"alice@example.test","code":"123456"}'
 * ```
 */
@Injectable()
export class UserLoginService {
  constructor(
    @Inject(EXT_USER_QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
    @Inject(QUERY_REPOSITORY.getUserCapabilities)
    private readonly capabilityRepository: IQueryRepository<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >,
    @Inject(LOGIN_CODE_VERIFIER)
    private readonly loginCodeVerifier: ILoginCodeVerifier,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly accessTokenIssuer: IAccessTokenIssuer,
    private readonly jwtAuthenticator: JwtAuthenticator,
    private readonly sessionService: SessionService = new SessionService(),
  ) {}

  /**
   * Extracts credentials (userId and optional bearer token) from session and/or request headers.
   *
   * Delegates token extraction and token-subject resolution to {@link JwtAuthenticator},
   * and session credential extraction to {@link SessionService}.
   *
   * @returns An object containing the resolved `userId` and `token`.
   *
   * @example
   * ```typescript
   * const { userId, token } = await this.userLoginService.extractCredentials(req.session, req.headers);
   * ```
   */
  async extractCredentials(
    sessionOrReq?:
      | Session<SessionData>
      | {
          session?: Session<SessionData>;
          headers?: Record<string, string | string[] | undefined>;
        },
    headersParam?: Record<string, string | string[] | undefined>,
  ): Promise<{ userId?: string; token?: string }> {
    let session: Session<SessionData> | undefined;
    let headers: Record<string, string | string[] | undefined> | undefined;

    if (
      sessionOrReq &&
      typeof sessionOrReq === 'object' &&
      ('headers' in sessionOrReq || 'session' in sessionOrReq) &&
      !('get' in sessionOrReq && 'set' in sessionOrReq)
    ) {
      const req = sessionOrReq as {
        session?: Session<SessionData>;
        headers?: Record<string, string | string[] | undefined>;
      };
      session = req.session;
      headers = req.headers;
    } else {
      session = sessionOrReq as Session<SessionData> | undefined;
      headers = headersParam;
    }

    const sessionCreds = this.sessionService.getCredentials(session);
    const token =
      this.jwtAuthenticator.extractToken(headers) ?? sessionCreds.token;
    let userId = sessionCreds.userId;

    if (!userId && headers) {
      userId = await this.jwtAuthenticator.extractUserId(headers);
    }

    return { userId, token };
  }

  /**
   * Verifies login credentials (email and one-time login code) against database records.
   *
   * @param email - User email address.
   * @param code - Login code provided by caller.
   * @returns The resolved {@link User} entity upon successful verification.
   * @throws {@link InvalidLoginCredentialsException} If the code does not match or the user does not exist.
   *
   * @example
   * ```ts
   * const user = await loginService.authenticate('alice@example.test', '123456');
   * ```
   */
  async authenticate(email: string, code: string): Promise<User> {
    await this.loginCodeVerifier.verify(code);

    const user = await this.queryRepository.find(new GetUserQuery({ email }));

    if (!user) {
      throw new InvalidLoginCredentialsException();
    }

    return user;
  }

  /**
   * Signs and issues a JWT access token for an authenticated user.
   *
   * Resolves user capabilities directly through repository port and delegates
   * token generation to {@link IAccessTokenIssuer}.
   *
   * @param user - The authenticated domain {@link User} entity.
   * @returns An {@link AuthResult} containing userId, resolved capabilities, and the signed JWT string.
   *
   * @example
   * ```ts
   * const result = await loginService.signToken(user);
   * console.log(result.accessToken);
   * ```
   */
  async signToken(user: User): Promise<AuthResult> {
    const userCapabilities = await this.capabilityRepository.find(
      new GetUserCapabilitiesQuery({ userId: user.id }),
    );

    const token = await this.accessTokenIssuer.issue({
      user,
      capabilities: userCapabilities,
    });

    return {
      userId: user.id,
      userCapabilities,
      ...token,
    };
  }
}
