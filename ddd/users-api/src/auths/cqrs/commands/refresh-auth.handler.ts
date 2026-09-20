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
import { DeadLetterBehavior } from '@nestjs-pipeline/deadletter';
import { MetricsBehavior } from '@nestjs-pipeline/opentelemetry';
import {
  createPartitionedRateLimitKeyFactory,
  RateLimitBehavior,
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
import { UserLoginService } from '../../services/user-login.service';
import type { CreateAuthResult } from '../results/create-auth.result';
import { RefreshAuthCommand } from './refresh-auth.command';

/** Refreshes are throttled per tenant and client IP, never per token. */
export const refreshAuthRateLimitKey = createPartitionedRateLimitKeyFactory(
  (ctx) => (ctx.request as RefreshAuthCommand).clientIp,
);

@CommandHandler(RefreshAuthCommand)
@UsePipeline(
  [MetricsBehavior, { meterName: 'users-api.auth' }],
  [RateLimitBehavior, { keyFactory: refreshAuthRateLimitKey }],
  [DeadLetterBehavior, { redactKeys: ['refreshToken'] }],
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
      reused.revoke(now);
      await this.sessionRepository.save(reused);
      throw new RefreshTokenReuseError();
    }

    // 2. Evaluate; a lost version race is re-evaluated once against the winner.
    const nextToken = this.refreshTokens.generate();
    let outcome: RefreshOutcome;
    try {
      outcome = await this.evaluate(session, presented, nextToken, now);
    } catch (error) {
      if (!(error instanceof ConcurrencyConflictError)) throw error;
      const reloaded = await this.sessionRepository.findById(session.id);
      if (!reloaded) throw new InvalidRefreshTokenError();
      session = reloaded;
      outcome = await this.evaluate(session, presented, nextToken, now);
    }

    // 3. Issue an access token; only a rotation hands out a new refresh token.
    const user = await this.users.find(
      new GetUserQuery({ userId: session.userId }, { refresh: true }),
    );
    if (!user) throw new InvalidRefreshTokenError();
    const access = await this.userLoginService.signToken(user, session.id);

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
  }

  private async evaluate(
    session: Auth,
    presented: string,
    nextToken: string,
    now: number,
  ): Promise<RefreshOutcome> {
    let outcome: RefreshOutcome;
    try {
      outcome = session.refresh(
        presented,
        this.refreshTokens.hash(nextToken),
        now,
        this.policy.refreshReuseGraceSeconds * 1000,
      );
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        await this.sessionRepository.save(session);
      }
      throw error;
    }
    if (outcome === 'rotated') {
      // Autocommit writes: the history row first, then the version-conditioned save.
      await this.sessions.recordConsumed(presented, session.id, now);
      await this.sessionRepository.save(session);
    }
    return outcome;
  }
}
