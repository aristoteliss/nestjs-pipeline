/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { claimedIdentityActor } from '@common/audit/audit.options';
import { AUDIT_ACTIONS } from '@common/constants';
import {
  type ITenantContext,
  TENANT_CONTEXT,
} from '@common/context/tenant-context.port';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, audit } from '@nestjs-pipeline/audit';
import { UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  type IQueryRepository,
  type IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core/application';
import { ConcurrencyConflictError } from '@nestjs-pipeline/ddd-core/domain';
import { deadLetter } from '@nestjs-pipeline/deadletter';
import { metrics } from '@nestjs-pipeline/opentelemetry';
import {
  createPartitionedRateLimitKeyFactory,
  rateLimit,
} from '@nestjs-pipeline/rate-limit';
import { GetUserQuery } from '../../../users/cqrs/queries/get-user.query';
import type { User } from '../../../users/domain/models/user.entity';
import { EXT_USER_QUERY_REPOSITORY } from '../../../users/persistence/repository.tokens';
import {
  AUTH_SESSIONS,
  AUTH_TOKEN_POLICY,
  type AuthTokenPolicy,
  type IAuthSessions,
  type IRefreshTokens,
  REFRESH_TOKENS,
} from '../../application/authentication.ports';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseError,
} from '../../domain/errors/refresh-token.errors';
import type { Auth, RefreshOutcome } from '../../domain/models/auth.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { AuthSessionRevocationService } from '../../services/auth-session-revocation.service';
import { UserLoginService } from '../../services/user-login.service';
import type { CreateAuthResult } from '../results/create-auth.result';
import { RefreshAuthCommand } from './refresh-auth.command';

/** Refreshes are throttled per tenant and client IP, never per token. */
export const refreshAuthRateLimitKey = createPartitionedRateLimitKeyFactory(
  (ctx) => (ctx.request as RefreshAuthCommand).clientIp,
);

@CommandHandler(RefreshAuthCommand)
@UsePipeline(
  metrics({ meterName: 'users-api.auth' }),
  rateLimit({ keyFactory: refreshAuthRateLimitKey }),
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
  CreateAuthResult
> {
  constructor(
    protected readonly eventBus: EventBus,
    @Inject(AUTH_SESSIONS) private readonly sessions: IAuthSessions,
    @Inject(COMMAND_REPOSITORY.updateAuth)
    private readonly sessionRepository: IWriteSideAggregateRepository<Auth>,
    private readonly sessionRevocation: AuthSessionRevocationService,
    @Inject(EXT_USER_QUERY_REPOSITORY.getUser)
    private readonly users: IQueryRepository<GetUserQuery, User | null>,
    @Inject(REFRESH_TOKENS) private readonly refreshTokens: IRefreshTokens,
    @Inject(AUTH_TOKEN_POLICY) private readonly policy: AuthTokenPolicy,
    private readonly userLoginService: UserLoginService,
    @Inject(TENANT_CONTEXT) private readonly tenantContext: ITenantContext,
  ) {
    super(eventBus);
  }

  async handle(command: RefreshAuthCommand): Promise<CreateAuthResult> {
    const presented = this.refreshTokens.hash(command.refreshToken);
    const now = Date.now();

    // 1. The live session lookup precedes the history lookup, so a history row
    //    whose rotation save failed can never revoke a still-current session.
    let session = await this.sessions.findByTokenHash(presented);
    if (!session) {
      const reused = await this.sessions.findByConsumedTokenHash(presented);
      if (!reused) throw new InvalidRefreshTokenError();
      await this.sessionRevocation.revoke(reused, now);
      throw new RefreshTokenReuseError();
    }

    const nextToken = this.refreshTokens.generate();
    for (let attempt = 0; ; attempt++) {
      try {
        const outcome = await this.applyRefresh(
          session,
          presented,
          nextToken,
          Date.now(),
        );
        const user = await this.users.find(
          new GetUserQuery({ userId: session.userId }, { refresh: true }),
        );
        if (!user) throw new InvalidRefreshTokenError();
        const access = await this.userLoginService.signToken(user, session.id);
        const preparedAt = Date.now();
        if (preparedAt >= session.expiresAt)
          throw new InvalidRefreshTokenError();
        if (outcome === 'grace') {
          await this.applyRefresh(session, presented, nextToken, preparedAt);
        } else {
          // Prepare fallible token data before committing either persistence write.
          await this.sessions.recordConsumed(presented, session.id, preparedAt);
          await this.sessionRepository.save(session);
        }

        return {
          aggregate: session,
          id: user.id,
          principalType: 'user',
          tenant: this.tenantContext.schema,
          email: user.email,
          department: user.department,
          accessToken: access.accessToken,
          accessTokenExpiresAt: access.expiresAt,
          ...(outcome === 'rotated' ? { refreshToken: nextToken } : {}),
          sessionExpiresAt: session.expiresAt,
        };
      } catch (error) {
        if (!(error instanceof ConcurrencyConflictError) || attempt === 1)
          throw error;
        const reloaded = await this.sessionRepository.findById(session.id);
        if (!reloaded) throw new InvalidRefreshTokenError();
        session = reloaded;
        if (
          presented !== session.refreshTokenHash &&
          presented !== session.previousRefreshTokenHash
        ) {
          await this.sessionRevocation.revoke(session, Date.now());
          throw new RefreshTokenReuseError();
        }
      }
    }
  }

  private async applyRefresh(
    session: Auth,
    presented: string,
    nextToken: string,
    now: number,
  ): Promise<RefreshOutcome> {
    try {
      return session.refresh(
        presented,
        this.refreshTokens.hash(nextToken),
        now,
        this.policy.refreshReuseGraceSeconds * 1000,
      );
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        await this.sessionRevocation.revoke(session, now);
      }
      throw error;
    }
  }
}
