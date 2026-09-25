/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IQueryRepository } from '@cqrs-ddd/core/application';
import { Inject, Injectable } from '@nestjs/common';
import { GetUserQuery } from '../../users/cqrs/queries/get-user.query';
import { User } from '../../users/domain/models/user.entity';
import { EXT_USER_QUERY_REPOSITORY } from '../../users/persistence/repository.tokens';
import {
  ACCESS_TOKEN_ISSUER,
  AUTH_TOKEN_POLICY,
  type AuthTokenPolicy,
  type IAccessTokenIssuer,
  type ILoginCodeVerifier,
  LOGIN_CODE_VERIFIER,
} from '../application/authentication.ports';
import {
  type IUserPermissionRules,
  USER_PERMISSION_RULES,
} from '../application/ports/user-permission-rules.port';
import { InvalidLoginCredentialsException } from '../domain/errors/authentication.exception';

export interface AuthResult {
  userId: string;
  accessToken: string;
  /** Access-token expiry as a Unix timestamp in milliseconds. */
  expiresAt: number;
}

/**
 * Application service responsible for user login verification and access token issuance.
 *
 * Encapsulates the `POST /auths/login` workflow:
 * 1. Fetches user account details from the tenant database via {@link GetUserQuery}.
 * 2. Validates the login code via {@link ILoginCodeVerifier} with user context.
 * 3. Signs a short-lived access token for a session via {@link IAccessTokenIssuer}.
 *
 * Infrastructure details like cryptography, JWT libraries, and environment variables
 * remain cleanly behind application ports.
 *
 * @example
 * ```bash
 * # Initiating login
 * curl -X POST https://api.example.com/auths/login \
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
    @Inject(LOGIN_CODE_VERIFIER)
    private readonly loginCodeVerifier: ILoginCodeVerifier,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly accessTokenIssuer: IAccessTokenIssuer,
    @Inject(AUTH_TOKEN_POLICY)
    private readonly policy: AuthTokenPolicy,
    @Inject(USER_PERMISSION_RULES)
    private readonly permissionRules: IUserPermissionRules,
  ) {}

  /**
   * Verifies login credentials (email and login code) against database records.
   *
   * Resolves the user identity through the query repository first and then delegates
   * credential verification to {@link ILoginCodeVerifier} with caller user context.
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
    const user = await this.queryRepository.find(
      new GetUserQuery({ email }, { refresh: true }),
    );

    if (!user) {
      throw new InvalidLoginCredentialsException();
    }

    await this.loginCodeVerifier.verify({ userId: user.id, code });

    return user;
  }

  /**
   * Signs and issues a JWT access token for an authenticated user.
   *
   * Delegates token generation to {@link IAccessTokenIssuer}.
   *
   * @param user - The authenticated domain {@link User} entity.
   * @param sessionId - The session (`Auth` id) the token belongs to.
   * @returns An {@link AuthResult} containing the userId and the signed JWT string.
   *
   * @example
   * ```ts
   * const result = await loginService.signToken(user, auth.id);
   * console.log(result.accessToken);
   * ```
   */
  async signToken(user: User, sessionId: string): Promise<AuthResult> {
    const token = await this.accessTokenIssuer.issue({
      user,
      sessionId,
      ...(this.policy.permissionsInAccessToken
        ? { permissions: await this.permissionRules.findOrdered(user.id) }
        : {}),
    });

    return {
      userId: user.id,
      ...token,
    };
  }
}
