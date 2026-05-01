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

import { SessionUser } from '@common/types/SessionUser';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { LoggingBehavior, UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  ICommandRepository,
} from '@nestjs-pipeline/ddd-core';
import { Auth, AuthSnapshot } from '../../domain/models/auth.entity';
import { AuthCreateOutcome } from '../../domain/outcomes/auth-create.outcome';
import { COMMAND_REPOSITORY } from '../../repositories/repository.tokens';
import { AuthService } from '../../services/auth.serivce';
import { CreateAuthCommand } from './create-auth.command';

@CommandHandler(CreateAuthCommand)
@UsePipeline([LoggingBehavior, { requestResponseLogLevel: 'log' }])
export class CreateAuthHandler extends CommandBaseHandler<
  CreateAuthCommand,
  SessionUser
> {
  constructor(
    protected readonly eventBus: EventBus,
    private readonly authService: AuthService,
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

    const verifiedUser = await this.authService.authenticate(email, code);

    const authResult = await this.authService.signToken(verifiedUser);

    const outcome = Auth.create(
      authResult.userId,
      verifiedUser.tenantId,
      authResult.accessToken,
    );

    await this.commandRepository.save(outcome);

    return {
      id: authResult.userId,
      email,
      tenantId: verifiedUser.tenantId,
      department: verifiedUser.department,
      capabilities: authResult.userCapabilities,
      token: authResult.accessToken,
    };
  }
}
