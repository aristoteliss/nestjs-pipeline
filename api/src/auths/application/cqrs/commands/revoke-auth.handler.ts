/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AUDIT_ACTIONS, RATE_LIMIT_COST } from '@common/constants/index.js';
import {
  CommandBaseHandler,
  type IQueryRepository,
} from '@cqrs-ddd/core/application';
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
import { InvalidRefreshTokenError } from '../../../domain/errors/refresh-token.errors.js';
import type { Auth } from '../../../domain/models/auth.entity.js';
import { QUERY_REPOSITORY } from '../../../persistence/repository.tokens.js';
import { PrincipalLoginService } from '../../../services/principal-login.service.js';
import {
  type IRefreshTokens,
  REFRESH_TOKENS,
} from '../../ports/refresh-tokens.port.js';
import {
  type ISessionCookies,
  SESSION_COOKIES,
} from '../../ports/session-cookies.port.js';
import { GetAuthByTokenHashQuery } from '../queries/get-auth-by-token-hash.query.js';
import { RevokeAuthCommand } from './revoke-auth.command.js';

@CommandHandler(RevokeAuthCommand)
@UsePipeline(
  metrics({ meterName: 'users-api.auth' }),
  rateLimit({
    keyFactory: createPartitionedRateLimitKeyFactory(
      (ctx) => (ctx.request as RevokeAuthCommand).clientIp,
    ),
    points: RATE_LIMIT_COST.logout,
  }),
  deadLetter({ redactKeys: ['refreshToken'] }),
  audit({
    action: AUDIT_ACTIONS.AUTH_LOGOUT,
    severity: AUDIT_SEVERITY.LOW,
    redactKeys: ['refreshToken'],
  }),
)
export class RevokeAuthHandler extends CommandBaseHandler<
  RevokeAuthCommand,
  Auth
> {
  constructor(
    protected readonly eventBus: EventBus,
    @Inject(QUERY_REPOSITORY.getAuthByTokenHash)
    private readonly authByTokenHash: IQueryRepository<
      GetAuthByTokenHashQuery,
      Auth | null
    >,
    @Inject(REFRESH_TOKENS) private readonly refreshTokens: IRefreshTokens,
    @Inject(SESSION_COOKIES) private readonly cookies: ISessionCookies,
    private readonly principalLoginService: PrincipalLoginService,
  ) {
    super(eventBus);
  }

  async handle({ refreshToken }: RevokeAuthCommand): Promise<Auth> {
    const auth = refreshToken
      ? await this.authByTokenHash.find(
          new GetAuthByTokenHashQuery({
            tokenHash: this.refreshTokens.hash(refreshToken),
          }),
        )
      : null;
    const revoked = auth
      ? await this.principalLoginService.revoke(auth, Date.now())
      : null;

    this.cookies.clear();
    if (!revoked) throw new InvalidRefreshTokenError();
    return revoked;
  }
}
