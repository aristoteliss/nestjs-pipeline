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
  ) {
    super(eventBus);
  }

  async handle(command: CreateAuthCommand): Promise<CreateAuthResult> {
    const { email, code } = command;
    const verifiedUser = await this.userLoginService.authenticate(email, code);
    const authResult = await this.userLoginService.signToken(verifiedUser);
    const auth = Auth.create(authResult.userId, authResult.accessToken);

    await this.commandRepository.save(auth);

    return {
      aggregate: auth,
      id: authResult.userId,
      principalType: 'user',
      tenant: this.tenantContext.schema,
      email,
      department: verifiedUser.department,
      capabilities: authResult.userCapabilities,
      token: authResult.accessToken,
      expiresAt: authResult.expiresAt,
      exp: authResult.exp,
    };
  }
}
