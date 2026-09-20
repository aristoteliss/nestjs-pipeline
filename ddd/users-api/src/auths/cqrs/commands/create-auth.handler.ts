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
import {
  type IPipelineContext,
  LoggingBehavior,
  UsePipeline,
} from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
} from '@nestjs-pipeline/ddd-core/application';
import { MetricsBehavior } from '@nestjs-pipeline/opentelemetry';
import {
  createPartitionedRateLimitKeyFactory,
  RateLimitBehavior,
} from '@nestjs-pipeline/rate-limit';
import {
  AUTH_TOKEN_POLICY,
  type AuthTokenPolicy,
  type IRefreshTokens,
  REFRESH_TOKENS,
} from '../../application/authentication.ports';
import { Auth, AuthSnapshot } from '../../domain/models/auth.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { UserLoginService } from '../../services/user-login.service';
import { CreateAuthResult } from '../results/create-auth.result';
import { CreateAuthCommand } from './create-auth.command';

/**
 * Login attempts are throttled per targeted account within a tenant. The address
 * is caller-supplied, which is the point: brute force against one account must
 * share a bucket whoever sends it.
 */
export const createAuthRateLimitKey = createPartitionedRateLimitKeyFactory(
  (ctx) => (ctx.request as CreateAuthCommand).email,
);

@CommandHandler(CreateAuthCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [MetricsBehavior, { meterName: 'users-api.auth' }],
  [RateLimitBehavior, { keyFactory: createAuthRateLimitKey }],
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
  CreateAuthResult
> {
  constructor(
    protected readonly eventBus: EventBus,
    private readonly userLoginService: UserLoginService,
    @Inject(COMMAND_REPOSITORY.createAuth)
    private readonly commandRepository: ICommandRepository<Auth, AuthSnapshot>,
    @Inject(TENANT_CONTEXT)
    private readonly tenantContext: ITenantContext,
    @Inject(REFRESH_TOKENS)
    private readonly refreshTokens: IRefreshTokens,
    @Inject(AUTH_TOKEN_POLICY)
    private readonly policy: AuthTokenPolicy,
  ) {
    super(eventBus);
  }

  async handle(command: CreateAuthCommand): Promise<CreateAuthResult> {
    const { email, code } = command;
    const user = await this.userLoginService.authenticate(email, code);
    const refreshToken = this.refreshTokens.generate();
    const sessionExpiresAt =
      Date.now() + this.policy.refreshTokenTtlSeconds * 1000;
    const auth = Auth.start(
      user.id,
      this.refreshTokens.hash(refreshToken),
      sessionExpiresAt,
    );

    await this.commandRepository.save(auth);
    const access = await this.userLoginService.signToken(user, auth.id);

    return {
      aggregate: auth,
      id: user.id,
      principalType: 'user',
      tenant: this.tenantContext.schema,
      email: user.email,
      department: user.department,
      accessToken: access.accessToken,
      accessTokenExpiresAt: access.expiresAt,
      refreshToken,
      sessionExpiresAt,
    };
  }
}
