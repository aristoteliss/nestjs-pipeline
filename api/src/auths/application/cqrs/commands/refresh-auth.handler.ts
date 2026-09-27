/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { claimedIdentityActor } from '@common/audit/audit.options';
import { AUDIT_ACTIONS, RATE_LIMIT_COST } from '@common/constants';
import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '@common/context/tenant-context.port';
import {
  CommandBaseHandler,
  type IQueryRepository,
  type IWriteSideAggregateRepository,
} from '@cqrs-ddd/core/application';
import { ConcurrencyConflictError } from '@cqrs-ddd/core/domain';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, audit } from '@nestjs-pipeline/audit';
import { UsePipeline } from '@nestjs-pipeline/core';
import { deadLetter } from '@nestjs-pipeline/deadletter';
import { metrics } from '@nestjs-pipeline/opentelemetry';
import {
  createPartitionedRateLimitKeyFactory,
  rateLimit,
} from '@nestjs-pipeline/rate-limit';
import { GetUserQuery } from '../../../../users/application/cqrs/queries/get-user.query';
import type { User } from '../../../../users/domain/models/user.entity';
import { EXT_USER_QUERY_REPOSITORY } from '../../../../users/persistence/repository.tokens';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../../../domain/errors/refresh-token.errors';
import type { Auth, RefreshOutcome } from '../../../domain/models/auth.entity';
import { COMMAND_REPOSITORY } from '../../../persistence/repository.tokens';
import { AuthSessionRevocationService } from '../../../services/auth-session-revocation.service';
import { UserLoginService } from '../../../services/user-login.service';
import {
  AUTH_SESSIONS,
  type IAuthSessions,
} from '../../ports/auth-sessions.port';
import {
  AUTH_TOKEN_POLICY,
  type AuthTokenPolicy,
} from '../../ports/auth-token-policy.port';
import {
  type IRefreshTokens,
  REFRESH_TOKENS,
} from '../../ports/refresh-tokens.port';
import {
  type ISessionCookies,
  SESSION_COOKIES,
} from '../../ports/session-cookies.port';
import type { AuthResult } from '../../results/auth.result';
import { RefreshAuthCommand } from './refresh-auth.command';

@CommandHandler(RefreshAuthCommand)
@UsePipeline(
  metrics({ meterName: 'users-api.auth' }),
  rateLimit({
    keyFactory: createPartitionedRateLimitKeyFactory(
      (ctx) => (ctx.request as RefreshAuthCommand).clientIp,
    ),
    points: RATE_LIMIT_COST.refresh,
  }),
  deadLetter({ redactKeys: ['refreshToken'] }),
  audit({
    action: AUDIT_ACTIONS.AUTH_REFRESH,
    severity: AUDIT_SEVERITY.LOW,
    redactKeys: ['refreshToken'],
    actor: () => claimedIdentityActor(),
  }),
)
export class RefreshAuthHandler extends CommandBaseHandler<
  RefreshAuthCommand,
  AuthResult
> {
  constructor(
    protected readonly eventBus: EventBus,
    @Inject(AUTH_SESSIONS) private readonly sessions: IAuthSessions,
    @Inject(COMMAND_REPOSITORY.updateAuth)
    private readonly authRepository: IWriteSideAggregateRepository<Auth>,
    private readonly sessionRevocation: AuthSessionRevocationService,
    @Inject(EXT_USER_QUERY_REPOSITORY.getUser)
    private readonly users: IQueryRepository<GetUserQuery, User | null>,
    @Inject(REFRESH_TOKENS) private readonly refreshTokens: IRefreshTokens,
    @Inject(AUTH_TOKEN_POLICY) private readonly policy: AuthTokenPolicy,
    private readonly userLoginService: UserLoginService,
    @Inject(TENANT_CONTEXT) private readonly tenantContext: ITenantContext,
    @Inject(SESSION_COOKIES) private readonly cookies: ISessionCookies,
  ) {
    super(eventBus);
  }

  async handle(command: RefreshAuthCommand): Promise<AuthResult> {
    const presented = this.refreshTokens.hash(command.refreshToken);
    const now = Date.now();

    let auth = await this.sessions.findByTokenHash(presented);
    if (!auth) {
      const reused = await this.sessions.findByConsumedTokenHash(presented);
      if (!reused) throw new InvalidRefreshTokenError();
      await this.sessionRevocation.revoke(reused, now);
      throw new RefreshTokenReuseError();
    }

    const nextToken = this.refreshTokens.generate();
    for (let attempt = 0; ; attempt++) {
      try {
        const outcome = await this.applyRefresh(
          auth,
          presented,
          nextToken,
          Date.now(),
        );
        const user = await this.users.find(
          new GetUserQuery({ userId: auth.userId }, { refresh: true }),
        );
        if (!user) throw new InvalidRefreshTokenError();
        const access = await this.userLoginService.signToken(user, auth.id);
        const preparedAt = Date.now();
        if (preparedAt >= auth.expiresAt) throw new InvalidRefreshTokenError();
        if (outcome === 'grace') {
          await this.applyRefresh(auth, presented, nextToken, preparedAt);
        } else {
          await this.sessions.recordConsumed(presented, auth.id, preparedAt);
          await this.authRepository.save(auth);
        }

        const result: AuthResult = {
          aggregate: auth,
          userId: user.id,
          principalType: 'user',
          tenant: this.tenantContext.schema,
          email: user.email,
          department: user.department,
          accessToken: access.accessToken,
          accessTokenExpiresAt: access.expiresAt,
          ...(outcome === 'rotated' ? { refreshToken: nextToken } : {}),
          sessionExpiresAt: auth.expiresAt,
        };
        this.cookies.save(result);
        return result;
      } catch (error) {
        if (!(error instanceof ConcurrencyConflictError) || attempt === 1)
          throw error;
        const reloaded = await this.authRepository.findById(auth.id);
        if (!reloaded) throw new InvalidRefreshTokenError();
        auth = reloaded;
        if (
          presented !== auth.refreshTokenHash &&
          presented !== auth.previousRefreshTokenHash
        ) {
          await this.sessionRevocation.revoke(auth, Date.now());
          throw new RefreshTokenReuseError();
        }
      }
    }
  }

  private async applyRefresh(
    auth: Auth,
    presented: string,
    nextToken: string,
    now: number,
  ): Promise<RefreshOutcome> {
    try {
      return auth.refresh(
        presented,
        this.refreshTokens.hash(nextToken),
        now,
        this.policy.refreshReuseGraceSeconds * 1000,
      );
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        await this.sessionRevocation.revoke(auth, now);
      }
      throw error;
    }
  }
}
