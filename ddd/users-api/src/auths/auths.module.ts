/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Module } from '@nestjs/common';
import {
  PERMISSIONS_IN_ACCESS_TOKEN,
  REFRESH_REUSE_GRACE_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../common/environment/auth-token.config';
import { GetUserQueryRepository } from '../users/persistence/get-user.query-repository';
import { EXT_USER_QUERY_REPOSITORY } from '../users/persistence/repository.tokens';
import {
  ACCESS_TOKEN_ISSUER,
  AUTH_SESSIONS,
  AUTH_TOKEN_POLICY,
  type AuthTokenPolicy,
  LOGIN_CODE_VERIFIER,
  REFRESH_TOKENS,
} from './application/authentication.ports';
import { AuthorizationModule } from './authorization.module';
import { AuthsController } from './controllers/auths.controller';
import { CreateAuthHandler } from './cqrs/commands/create-auth.handler';
import { DeleteAuthHandler } from './cqrs/commands/delete-auth.handler';
import { RefreshAuthHandler } from './cqrs/commands/refresh-auth.handler';
import { EnvLoginCodeVerifier } from './infrastructure/env-login-code.verifier';
import { JoseAccessTokenIssuer } from './infrastructure/jose-access-token.issuer';
import { NodeRefreshTokens } from './infrastructure/node-refresh-tokens';
import { AuthSessionsRepository } from './persistence/auth-sessions.repository';
import { CreateAuthCommandRepository } from './persistence/create-auth.command-repository';
import { COMMAND_REPOSITORY } from './persistence/repository.tokens';
import { UpdateAuthCommandRepository } from './persistence/update-auth.command-repository';
import { ApiClientAuthenticator } from './services/api-client-authenticator';
import { JwtAuthenticator } from './services/jwt-authenticator';
import { RequestPrincipalResolver } from './services/request-principal-resolver';
import { SessionService } from './services/session.service';
import { UserLoginService } from './services/user-login.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [AuthsController],
  providers: [
    // Repositories (Query)
    {
      provide: EXT_USER_QUERY_REPOSITORY.getUser,
      useClass: GetUserQueryRepository,
    },
    { provide: AUTH_SESSIONS, useClass: AuthSessionsRepository },

    // Repositories (Command)
    {
      provide: COMMAND_REPOSITORY.createAuth,
      useClass: CreateAuthCommandRepository,
    },
    {
      provide: COMMAND_REPOSITORY.updateAuth,
      useClass: UpdateAuthCommandRepository,
    },

    // Authentication infrastructure adapters exposed through application ports.
    EnvLoginCodeVerifier,
    JoseAccessTokenIssuer,
    { provide: LOGIN_CODE_VERIFIER, useExisting: EnvLoginCodeVerifier },
    { provide: ACCESS_TOKEN_ISSUER, useExisting: JoseAccessTokenIssuer },
    { provide: REFRESH_TOKENS, useClass: NodeRefreshTokens },
    {
      provide: AUTH_TOKEN_POLICY,
      useValue: {
        refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
        refreshReuseGraceSeconds: REFRESH_REUSE_GRACE_SECONDS,
        permissionsInAccessToken: PERMISSIONS_IN_ACCESS_TOKEN,
      } satisfies AuthTokenPolicy,
    },

    SessionService,
    UserLoginService,
    JwtAuthenticator,
    ApiClientAuthenticator,
    RequestPrincipalResolver,

    // Commands
    CreateAuthHandler,
    DeleteAuthHandler,
    RefreshAuthHandler,
  ],
  exports: [
    SessionService,
    UserLoginService,
    RequestPrincipalResolver,
    JwtAuthenticator,
    ApiClientAuthenticator,
  ],
})
export class AuthsModule {}
