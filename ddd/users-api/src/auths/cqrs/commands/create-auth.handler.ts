/*
 * Copyright (C) 2026-present Aristotelis
 * See repository license for full terms.
 */

import { requireTenantId } from '@common/cqrs/helpers/requireTenantId.helper';
import { AUDIT_ACTIONS } from '@common/constants';
import { SessionUser } from '@common/types/SessionUser';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, AuditBehavior } from '@nestjs-pipeline/audit';
import {
  type IPipelineContext,
  LoggingBehavior,
  UsePipeline,
} from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
} from '@nestjs-pipeline/ddd-core';
import { MetricsBehavior } from '@nestjs-pipeline/opentelemetry';
import { RateLimitBehavior } from '@nestjs-pipeline/rate-limit';
import { TenantSchemaContext } from '@persistence/tenant-schema.context';
import { Auth, AuthSnapshot } from '../../domain/models/auth.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { UserLoginService } from '../../services/user-login.service';
import { CreateAuthCommand } from './create-auth.command';

/** Builds the tenant/email partition used by login rate limiting. */
export function createAuthRateLimitKey(ctx: IPipelineContext): string {
  const tenantId = requireTenantId(ctx, 'authentication rate limiting');
  return `${tenantId}:auth:login:${(ctx.request as CreateAuthCommand).email}`;
}

@CommandHandler(CreateAuthCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  [MetricsBehavior, { meterName: 'users-api.auth' }],
  [RateLimitBehavior, { keyFactory: createAuthRateLimitKey }],
  [
    AuditBehavior,
    {
      action: AUDIT_ACTIONS.AUTH_LOGIN,
      severity: AUDIT_SEVERITY.MEDIUM,
      redactKeys: ['code'],
      actor: (ctx: IPipelineContext) => {
        const req = ctx.request as CreateAuthCommand;
        return { id: req?.email ?? 'anonymous', email: req?.email };
      },
    },
  ],
)
export class CreateAuthHandler extends CommandBaseHandler<
  CreateAuthCommand,
  SessionUser
> {
  constructor(
    protected readonly eventBus: EventBus,
    private readonly userLoginService: UserLoginService,
    @Inject(COMMAND_REPOSITORY.createAuth)
    private readonly commandRepository: ICommandRepository<Auth, AuthSnapshot>,
    private readonly tenantSchemaContext: TenantSchemaContext,
  ) {
    super(eventBus);
  }

  async handle(
    command: CreateAuthCommand,
  ): Promise<SessionUser & { token: string }> {
    const { email, code } = command;
    const verifiedUser = await this.userLoginService.authenticate(email, code);
    const authResult = await this.userLoginService.signToken(verifiedUser);
    const auth = Auth.create(authResult.userId, authResult.accessToken);

    await this.commandRepository.save(auth);
    this.commit(auth);

    return {
      id: authResult.userId,
      principalType: 'user',
      tenant: this.tenantSchemaContext.schema,
      email,
      department: verifiedUser.department,
      capabilities: authResult.userCapabilities,
      token: authResult.accessToken,
      expiresAt: authResult.expiresAt,
      exp: authResult.exp,
    };
  }
}
