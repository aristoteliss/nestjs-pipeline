/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { Inject, Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
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

export interface AuthResult {
  userId: string;
  userCapabilities: UserCapabilities;
  accessToken: string;
  expiresAt?: number;
  exp?: number;
}

/**
 * Application orchestration for login.
 *
 * Credential verification and token issuance are delegated to application
 * ports. This service does not read environment variables, perform crypto/JWT
 * work, or depend on the concrete tenant persistence context.
 *
 * Capability lookup still uses QueryBus here intentionally; architecture issue
 * #4 addresses nested CQRS dispatch independently.
 */
@Injectable()
export class UserLoginService {
  constructor(
    @Inject(QueryBus)
    private readonly queryBus: QueryBus,
    @Inject(EXT_USER_QUERY_REPOSITORY.getUser)
    private readonly queryRepository: IQueryRepository<GetUserQuery, User>,
    @Inject(LOGIN_CODE_VERIFIER)
    private readonly loginCodeVerifier: ILoginCodeVerifier,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly accessTokenIssuer: IAccessTokenIssuer,
  ) {}

  /** Verifies the supplied login code and resolves the authenticated user. */
  async authenticate(email: string, code: string): Promise<User> {
    await this.loginCodeVerifier.verify(code);
    const user = await this.queryRepository.find(new GetUserQuery({ email }));
    if (!user) throw new InvalidLoginCredentialsException();
    return user;
  }

  /** Resolves capabilities and delegates token materialization to the issuer port. */
  async signToken(user: User): Promise<AuthResult> {
    const userCapabilities = await this.queryBus.execute<
      GetUserCapabilitiesQuery,
      UserCapabilities
    >(new GetUserCapabilitiesQuery({ userId: user.id }));
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
