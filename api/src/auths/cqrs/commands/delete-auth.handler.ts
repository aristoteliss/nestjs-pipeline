/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { AUDIT_ACTIONS } from '@common/constants';
import { CommandBaseHandler } from '@cqrs-ddd/core/application';
import { Inject } from '@nestjs/common';
import { CommandHandler, EventBus } from '@nestjs/cqrs';
import { AUDIT_SEVERITY, audit } from '@nestjs-pipeline/audit';
import { UsePipeline } from '@nestjs-pipeline/core';
import { deadLetter } from '@nestjs-pipeline/deadletter';
import {
  AUTH_SESSIONS,
  type IAuthSessions,
  type IRefreshTokens,
  REFRESH_TOKENS,
} from '../../application/authentication.ports';
import { InvalidRefreshTokenError } from '../../domain/errors/refresh-token.errors';
import type { Auth } from '../../domain/models/auth.entity';
import { AuthSessionRevocationService } from '../../services/auth-session-revocation.service';
import { DeleteAuthCommand } from './delete-auth.command';

@CommandHandler(DeleteAuthCommand)
@UsePipeline(
  deadLetter({ redactKeys: ['refreshToken'] }),
  audit({
    action: AUDIT_ACTIONS.AUTH_LOGOUT,
    severity: AUDIT_SEVERITY.LOW,
    redactKeys: ['refreshToken'],
  }),
)
export class DeleteAuthHandler extends CommandBaseHandler<
  DeleteAuthCommand,
  Auth
> {
  constructor(
    protected readonly eventBus: EventBus,
    @Inject(AUTH_SESSIONS) private readonly sessions: IAuthSessions,
    private readonly sessionRevocation: AuthSessionRevocationService,
    @Inject(REFRESH_TOKENS) private readonly refreshTokens: IRefreshTokens,
  ) {
    super(eventBus);
  }

  async handle(command: DeleteAuthCommand): Promise<Auth> {
    const now = Date.now();
    const session = await this.sessions.findByTokenHash(
      this.refreshTokens.hash(command.refreshToken),
    );
    if (!session) throw new InvalidRefreshTokenError();

    const revoked = await this.sessionRevocation.revoke(session, now);
    if (!revoked) throw new InvalidRefreshTokenError();
    return revoked;
  }
}
