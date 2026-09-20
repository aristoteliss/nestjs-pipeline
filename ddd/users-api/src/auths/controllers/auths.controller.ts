/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { SessionData } from '@common/types/SessionUser';
import { Session } from '@fastify/secure-session';
import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ZodPipe } from '@nestjs-pipeline/zod';
import { CreateAuthCommand } from '../cqrs/commands/create-auth.command';
import { DeleteAuthCommand } from '../cqrs/commands/delete-auth.command';
import { RefreshAuthCommand } from '../cqrs/commands/refresh-auth.command';
import { CreateAuthResult } from '../cqrs/results/create-auth.result';
import { InvalidRefreshTokenError } from '../domain/errors/refresh-token.errors';
import { LoginDto, LoginDtoSchema } from '../dtos/login.dto';
import { LoginMapper } from '../mappers/login.mapper';
import { toSessionRes } from '../mappers/session.mapper';
import { SessionResponse } from '../responses/session.res';
import { SessionService } from '../services/session.service';
import {
  type CookieRequest,
  type CookieResponse,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from './refresh-cookie';

type AuthRequest = CookieRequest & {
  session?: Session<SessionData>;
  ip?: string;
};

@Controller('auths')
export class AuthsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Starts a session. Returns a short-lived access token in the body and sets
   * the refresh token as an `HttpOnly` cookie. On Fastify the access token is
   * also kept in the secure session cookie.
   */
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginDtoSchema)) dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<SessionResponse> {
    const result = await this.commandBus.execute<
      CreateAuthCommand,
      CreateAuthResult
    >(LoginMapper.map(dto));
    return this.respond(result, req, res);
  }

  /**
   * Exchanges the refresh cookie for a new access token. A rotation sets a new
   * cookie; a grace-window answer leaves the cookie unchanged.
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<SessionResponse> {
    const refreshToken = readRefreshCookie(req);
    if (!refreshToken) throw new InvalidRefreshTokenError();

    const result = await this.commandBus.execute<
      RefreshAuthCommand,
      CreateAuthResult
    >(new RefreshAuthCommand({ refreshToken, clientIp: req.ip ?? 'unknown' }));
    return this.respond(result, req, res);
  }

  /**
   * Revokes the session of the refresh cookie and clears the cookies. An
   * unknown or missing cookie still answers 204. An issued access token stays
   * valid until it expires.
   */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: CookieResponse,
  ): Promise<void> {
    const refreshToken = readRefreshCookie(req);
    if (refreshToken) {
      try {
        await this.commandBus.execute(new DeleteAuthCommand({ refreshToken }));
      } catch (error) {
        if (!(error instanceof InvalidRefreshTokenError)) throw error;
      }
    }
    clearRefreshCookie(res);
    this.sessionService.clearSession(req.session);
  }

  private respond(
    result: CreateAuthResult,
    req: AuthRequest,
    res: CookieResponse,
  ): SessionResponse {
    if (result.refreshToken) {
      setRefreshCookie(res, result.refreshToken, result.sessionExpiresAt);
    }
    const body = toSessionRes(result);
    this.sessionService.saveSession(req.session, body);
    return body;
  }
}
