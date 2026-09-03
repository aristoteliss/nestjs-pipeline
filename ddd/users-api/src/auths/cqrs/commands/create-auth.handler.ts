/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

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
import { AuthCreateOutcome } from '../../domain/outcomes/auth-create.outcome';
import { COMMAND_REPOSITORY } from '../../repositories/repository.tokens';
import { UserLoginService } from '../../services/user-login.service';
import { CreateAuthCommand } from './create-auth.command';

@CommandHandler(CreateAuthCommand)
@UsePipeline(
  [LoggingBehavior, { requestResponseLogLevel: 'log' }],
  // Override global MetricsBehavior with auths-specific meter name
  [MetricsBehavior, { meterName: 'users-api.auth' }],
  // Rate limit login attempts to prevent brute-force attacks
  [
    RateLimitBehavior,
    {
      keyFactory: (ctx: IPipelineContext) =>
        `${TenantSchemaContext.currentSchema}:auth:login:${(ctx.request as CreateAuthCommand).email}`,
    },
  ],
  // Audit login events with actor extracted from the login command
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
    private readonly commandRepository: ICommandRepository<
      AuthCreateOutcome,
      AuthSnapshot
    >,
  ) {
    super(eventBus);
  }

  async handle(
    command: CreateAuthCommand,
  ): Promise<SessionUser & { token: string }> {
    const { email, code } = command;

    const verifiedUser = await this.userLoginService.authenticate(email, code);

    const authResult = await this.userLoginService.signToken(verifiedUser);

    const outcome = Auth.create(authResult.userId, authResult.accessToken);

    await this.commandRepository.save(outcome);

    return {
      id: authResult.userId,
      tenant: TenantSchemaContext.currentSchema,
      email,
      department: verifiedUser.department,
      capabilities: authResult.userCapabilities,
      token: authResult.accessToken,
    };
  }
}
