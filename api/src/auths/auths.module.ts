/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Module } from '@nestjs/common';
import {
  PERMISSIONS_IN_ACCESS_TOKEN,
  REFRESH_REUSE_GRACE_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../common/environment/auth-token.config';
import { GetUserQueryRepository } from '../users/persistence/get-user.query-repository';
import { EXT_USER_QUERY_REPOSITORY } from '../users/persistence/repository.tokens';
import { CreateAuthHandler } from './application/cqrs/commands/create-auth.handler';
import { RefreshAuthHandler } from './application/cqrs/commands/refresh-auth.handler';
import { RevokeAuthHandler } from './application/cqrs/commands/revoke-auth.handler';
import { ACCESS_TOKEN_ISSUER } from './application/ports/access-token-issuer.port';
import { AUTH_SESSIONS } from './application/ports/auth-sessions.port';
import {
  AUTH_TOKEN_POLICY,
  type AuthTokenPolicy,
} from './application/ports/auth-token-policy.port';
import { LOGIN_CODE_VERIFIER } from './application/ports/login-code-verifier.port';
import { REFRESH_TOKENS } from './application/ports/refresh-tokens.port';
import { SESSION_COOKIES } from './application/ports/session-cookies.port';
import { AuthorizationModule } from './authorization.module';
import { AuthsController } from './controllers/auths.controller';
import { JoseAccessTokenIssuer } from './infrastructure/jose-access-token.issuer';
import { NodeRefreshTokens } from './infrastructure/node-refresh-tokens';
import { SharedDemoLoginCodeVerifier } from './infrastructure/shared-demo-login-code.verifier';
import { AuthSessionsRepository } from './persistence/auth-sessions.repository';
import { CreateAuthCommandRepository } from './persistence/create-auth.command-repository';
import { COMMAND_REPOSITORY } from './persistence/repository.tokens';
import { UpdateAuthCommandRepository } from './persistence/update-auth.command-repository';
import { ApiClientAuthenticator } from './services/api-client-authenticator';
import { AuthSessionRevocationService } from './services/auth-session-revocation.service';
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
    SharedDemoLoginCodeVerifier,
    JoseAccessTokenIssuer,
    { provide: LOGIN_CODE_VERIFIER, useExisting: SharedDemoLoginCodeVerifier },
    { provide: ACCESS_TOKEN_ISSUER, useExisting: JoseAccessTokenIssuer },
    { provide: REFRESH_TOKENS, useClass: NodeRefreshTokens },
    {
      provide: AUTH_TOKEN_POLICY,
      useValue: {
        refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
        refreshReuseGraceSeconds: REFRESH_REUSE_GRACE_SECONDS,
        embedPermissions: PERMISSIONS_IN_ACCESS_TOKEN,
      } satisfies AuthTokenPolicy,
    },

    AuthSessionRevocationService,
    SessionService,
    { provide: SESSION_COOKIES, useExisting: SessionService },
    UserLoginService,
    JwtAuthenticator,
    ApiClientAuthenticator,
    RequestPrincipalResolver,

    // Commands
    CreateAuthHandler,
    RevokeAuthHandler,
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
