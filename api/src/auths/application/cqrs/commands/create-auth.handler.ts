/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { claimedIdentityActor } from '@common/audit/audit.options.js';
import { AUDIT_ACTIONS, RATE_LIMIT_COST } from '@common/constants/index.js';
import {
  CommandBaseHandler,
  ICommandRepository,
  requireTenant,
} from '@cqrs-ddd/core/application';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, audit } from '@nestjs-pipeline/audit';
import { type IPipelineContext, UsePipeline } from '@nestjs-pipeline/core';
import { metrics } from '@nestjs-pipeline/opentelemetry';
import {
  createPartitionedRateLimitKeyFactory,
  rateLimit,
} from '@nestjs-pipeline/rate-limit';
import { Auth, AuthSnapshot } from '../../../domain/models/auth.entity.js';
import { COMMAND_REPOSITORY } from '../../../persistence/repository.tokens.js';
import { PrincipalLoginService } from '../../../services/principal-login.service.js';
import {
  AUTH_TOKEN_POLICY,
  type AuthTokenPolicy,
} from '../../ports/auth-token-policy.port.js';
import {
  type IRefreshTokens,
  REFRESH_TOKENS,
} from '../../ports/refresh-tokens.port.js';
import {
  type ISessionCookies,
  SESSION_COOKIES,
} from '../../ports/session-cookies.port.js';
import { AuthResult } from '../../results/auth.result.js';
import { CreateAuthCommand } from './create-auth.command.js';

@CommandHandler(CreateAuthCommand)
@UsePipeline(
  metrics({ meterName: 'users-api.auth' }),
  rateLimit({
    keyFactory: createPartitionedRateLimitKeyFactory(
      (ctx) => (ctx.request as CreateAuthCommand).clientIp,
    ),
    points: RATE_LIMIT_COST.login,
  }),
  audit({
    action: AUDIT_ACTIONS.AUTH_LOGIN,
    severity: AUDIT_SEVERITY.MEDIUM,
    redactKeys: ['code'],
    actor: (ctx: IPipelineContext) =>
      claimedIdentityActor((ctx.request as CreateAuthCommand)?.email),
  }),
)
export class CreateAuthHandler extends CommandBaseHandler<
  CreateAuthCommand,
  AuthResult
> {
  constructor(
    protected readonly eventBus: EventBus,
    private readonly principalLoginService: PrincipalLoginService,
    @Inject(COMMAND_REPOSITORY.createAuth)
    private readonly commandRepository: ICommandRepository<Auth, AuthSnapshot>,
    @Inject(REFRESH_TOKENS)
    private readonly refreshTokens: IRefreshTokens,
    @Inject(AUTH_TOKEN_POLICY)
    private readonly policy: AuthTokenPolicy,
    @Inject(SESSION_COOKIES)
    private readonly cookies: ISessionCookies,
  ) {
    super(eventBus);
  }

  async handle(command: CreateAuthCommand): Promise<AuthResult> {
    const { email, code } = command;
    const user = await this.principalLoginService.authenticate(email, code);
    const refreshToken = this.refreshTokens.generate();
    const sessionExpiresAt =
      Date.now() + this.policy.refreshTokenTtlSeconds * 1000;
    const auth = Auth.create(
      user.id,
      this.refreshTokens.hash(refreshToken),
      sessionExpiresAt,
    );

    await this.commandRepository.save(auth);
    const access = await this.principalLoginService.sign(user, auth.id);

    const result: AuthResult = {
      aggregate: auth,
      userId: user.id,
      principalType: 'user',
      tenant: requireTenant('login'),
      email: user.email,
      department: user.department,
      accessToken: access.accessToken,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      sessionExpiresAt,
    };
    this.cookies.save(result);
    return result;
  }
}
