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

import { Inject, Injectable } from '@nestjs/common';
import type { UserCapabilities } from '@nestjs-pipeline/casl';
import type { IQueryRepository } from '@nestjs-pipeline/ddd-core';
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

export interface AuthResult {
  userId: string;
  userCapabilities: UserCapabilities;
  accessToken: string;
  expiresAt?: number;
  exp?: number;
}

/**
 * Application service responsible for the login use-case orchestration.
 *
 * It resolves users and capabilities through query ports, verifies credentials
 * through {@link ILoginCodeVerifier}, and delegates token materialization to
 * {@link IAccessTokenIssuer}. Environment access, cryptography/JWT details,
 * tenant infrastructure and HTTP exception mapping therefore remain outside the
 * application service.
 *
 * The service also preserves the architecture issue #4 fix: capability lookup
 * uses the repository port directly and never dispatches a nested `QueryBus`
 * while the login command is executing.
 */
@Injectable()
export class UserLoginService {
  constructor(
    @Inject(QUERY_REPOSITORY.getUserCapabilities)
    private readonly capabilitiesRepository: IQueryRepository<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >,
    @Inject(EXT_USER_QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
    @Inject(LOGIN_CODE_VERIFIER)
    private readonly loginCodeVerifier: ILoginCodeVerifier,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly accessTokenIssuer: IAccessTokenIssuer,
  ) {}

  /**
   * Verifies the supplied credential through the application port and resolves
   * the user from the active tenant's query repository.
   *
   * @throws {InvalidLoginCredentialsException} when no matching user exists.
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
   * Resolves the user's current capabilities and delegates access-token issuance
   * to the configured infrastructure adapter.
   */
  async signToken(user: User): Promise<AuthResult> {
    const userCapabilities = await this.capabilitiesRepository.find(
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
