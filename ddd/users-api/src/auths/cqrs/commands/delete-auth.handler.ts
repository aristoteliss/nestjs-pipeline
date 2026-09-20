/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { UsePipeline } from '@nestjs-pipeline/core';
import {
  CommandBaseHandler,
  type IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core/application';
import { DeadLetterBehavior } from '@nestjs-pipeline/deadletter';
import {
  AUTH_SESSIONS,
  type IAuthSessions,
  type IRefreshTokens,
  REFRESH_TOKENS,
} from '../../application/authentication.ports';
import { InvalidRefreshTokenError } from '../../domain/errors/refresh-token.errors';
import type { Auth } from '../../domain/models/auth.entity';
import { COMMAND_REPOSITORY } from '../../persistence/repository.tokens';
import { DeleteAuthCommand } from './delete-auth.command';

@CommandHandler(DeleteAuthCommand)
@UsePipeline([DeadLetterBehavior, { redactKeys: ['refreshToken'] }])
export class DeleteAuthHandler extends CommandBaseHandler<
  DeleteAuthCommand,
  Auth
> {
  constructor(
    protected readonly eventBus: EventBus,
    @Inject(AUTH_SESSIONS) private readonly sessions: IAuthSessions,
    @Inject(COMMAND_REPOSITORY.updateAuth)
    private readonly sessionRepository: IWriteSideAggregateRepository<Auth>,
    @Inject(REFRESH_TOKENS) private readonly refreshTokens: IRefreshTokens,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteAuthCommand): Promise<Auth> {
    const session = await this.sessions.findByTokenHash(
      this.refreshTokens.hash(command.refreshToken),
    );
    if (!session) throw new InvalidRefreshTokenError();

    session.revoke(Date.now());
    await this.sessionRepository.save(session);
    return session;
  }
}
