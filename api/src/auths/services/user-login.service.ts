/* Copyright (C) 2026-present Aristotelis — see repository license. */

import type { IQueryRepository } from '@cqrs-ddd/core/application';
import { Inject, Injectable } from '@nestjs/common';
import { GetUserQuery } from '../../users/application/cqrs/queries/get-user.query';
import { User } from '../../users/domain/models/user.entity';
import { EXT_USER_QUERY_REPOSITORY } from '../../users/persistence/repository.tokens';
import {
  ACCESS_TOKEN_ISSUER,
  type AccessTokenIssueResult,
  type IAccessTokenIssuer,
} from '../application/ports/access-token-issuer.port';
import {
  AUTH_TOKEN_POLICY,
  type AuthTokenPolicy,
} from '../application/ports/auth-token-policy.port';
import {
  type ILoginCodeVerifier,
  LOGIN_CODE_VERIFIER,
} from '../application/ports/login-code-verifier.port';
import {
  type IUserPermissionRules,
  USER_PERMISSION_RULES,
} from '../application/ports/user-permission-rules.port';
import { InvalidLoginCredentialsException } from '../domain/errors/authentication.exception';

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
   * Finds the user by email in primary storage and verifies the login code
   * through `LOGIN_CODE_VERIFIER`.
   *
   * @param email - The claimed email.
   * @param code - The presented login code.
   * @returns The authenticated user.
   * @throws InvalidLoginCredentialsException for an unknown email and for a wrong
   *   code alike, so the answer does not reveal which accounts exist.
   *
   * @example
   * ```ts
   * const user = await this.userLoginService.authenticate(command.email, command.code);
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
   * Issues an access token for `user` bound to the `Auth` session `sessionId`.
   * When `embedPermissions` is on, it reads the user's rules first and
   * embeds them, so the token carries the rules as they are at issue time.
   *
   * @param user - The authenticated user.
   * @param sessionId - Id of the `Auth` session; the token carries it as `sid`.
   * @returns The token and its expiry as a Unix timestamp in milliseconds.
   *
   * @example
   * ```ts
   * await this.commandRepository.save(auth);
   * const access = await this.userLoginService.signToken(user, auth.id);
   * ```
   */
  async signToken(
    user: User,
    sessionId: string,
  ): Promise<AccessTokenIssueResult> {
    return this.accessTokenIssuer.issue({
      user,
      sessionId,
      ...(this.policy.embedPermissions
        ? { permissions: await this.permissionRules.findOrdered(user.id) }
        : {}),
    });
  }
}
