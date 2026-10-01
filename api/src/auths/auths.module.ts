/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Module } from '@nestjs/common';
import {
  PERMISSIONS_IN_ACCESS_TOKEN,
  REFRESH_REUSE_GRACE_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../common/environment/auth-token.config.js';
import { ReliabilityModule } from '../common/modules/reliability.module.js';
import { GetUserQueryRepository } from '../users/persistence/get-user.query-repository.js';
import { EXT_USER_QUERY_REPOSITORY } from '../users/persistence/repository.tokens.js';
import { CreateAuthHandler } from './application/cqrs/commands/create-auth.handler.js';
import { RevokeAuthHandler } from './application/cqrs/commands/revoke-auth.handler.js';
import { GetUserPermissionRulesHandler } from './application/cqrs/queries/get-user-permission-rules.handler.js';
import { ACCESS_TOKEN_ISSUER } from './application/ports/access-token-issuer.port.js';
import {
  AUTH_TOKEN_POLICY,
  type AuthTokenPolicy,
} from './application/ports/auth-token-policy.port.js';
import { LOGIN_CODE_VERIFIER } from './application/ports/login-code-verifier.port.js';
import { REFRESH_TOKENS } from './application/ports/refresh-tokens.port.js';
import { SESSION_COOKIES } from './application/ports/session-cookies.port.js';
import { AuthorizationModule } from './authorization.module.js';
import { AuthsController } from './controllers/auths.controller.js';
import { JoseAccessTokenIssuer } from './infrastructure/jose-access-token.issuer.js';
import { NodeRefreshTokens } from './infrastructure/node-refresh-tokens.js';
import { SharedDemoLoginCodeVerifier } from './infrastructure/shared-demo-login-code.verifier.js';
import { CreateAuthCommandRepository } from './persistence/create-auth.command-repository.js';
import { GetAuthByConsumedTokenHashQueryRepository } from './persistence/get-auth-by-consumed-token-hash.query-repository.js';
import { GetAuthByTokenHashQueryRepository } from './persistence/get-auth-by-token-hash.query-repository.js';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from './persistence/repository.tokens.js';
import { UpdateAuthCommandRepository } from './persistence/update-auth.command-repository.js';
import { ApiClientAuthenticator } from './services/api-client-authenticator.js';
import { JwtAuthenticator } from './services/jwt-authenticator.js';
import { PrincipalLoginService } from './services/principal-login.service.js';
import { RequestPrincipalResolver } from './services/request-principal-resolver.js';
import { SessionService } from './services/session.service.js';

@Module({
  imports: [AuthorizationModule, ReliabilityModule],
  controllers: [AuthsController],
  providers: [
    // Repositories (Query)
    {
      provide: EXT_USER_QUERY_REPOSITORY.getUser,
      useClass: GetUserQueryRepository,
    },
    {
      provide: QUERY_REPOSITORY.getAuthByTokenHash,
      useClass: GetAuthByTokenHashQueryRepository,
    },
    {
      provide: QUERY_REPOSITORY.getAuthByConsumedTokenHash,
      useClass: GetAuthByConsumedTokenHashQueryRepository,
    },

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

    SessionService,
    { provide: SESSION_COOKIES, useExisting: SessionService },
    PrincipalLoginService,
    JwtAuthenticator,
    ApiClientAuthenticator,
    RequestPrincipalResolver,

    // Commands
    CreateAuthHandler,
    RevokeAuthHandler,

    //Queries
    GetUserPermissionRulesHandler,
  ],
  exports: [
    COMMAND_REPOSITORY.updateAuth,
    EXT_USER_QUERY_REPOSITORY.getUser,
    SessionService,
    PrincipalLoginService,
    RequestPrincipalResolver,
    JwtAuthenticator,
    ApiClientAuthenticator,
  ],
})
export class AuthsModule {}
