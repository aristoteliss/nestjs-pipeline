/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { CreateAuthCommand } from '../application/cqrs/commands/create-auth.command.js';
import { RevokeAuthCommand } from '../application/cqrs/commands/revoke-auth.command.js';
import type { AuthResult } from '../application/results/auth.result.js';
import { RefreshToken } from '../decorators/refresh-token.decorator.js';
import { InvalidRefreshTokenError } from '../domain/errors/refresh-token.errors.js';
import { type LoginDto, LoginDtoSchema } from '../dtos/login.dto.js';
import type { RefreshTokenDto } from '../dtos/refresh-token.dto.js';
import type { SessionResponse } from '../dtos/sessionResponse.dto.js';
import { LoginMapper } from '../mappers/login.mapper.js';
import { toSessionRes } from '../mappers/session.mapper.js';
import { PrincipalLoginService } from '../services/principal-login.service.js';

@Controller('auths')
export class AuthsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly principalLoginService: PrincipalLoginService,
  ) {}

  /**
   * Starts a session. Returns a short-lived access token in the body and sets
   * the refresh token as an `HttpOnly` cookie. On Fastify the access token is
   * also kept in the secure session cookie.
   */
  @Post('login')
  @HttpCode(200)
  async login(
    @Body({ schema: LoginDtoSchema }) dto: LoginDto,
    @Ip() clientIp: string,
  ): Promise<SessionResponse> {
    const result = await this.commandBus.execute<CreateAuthCommand, AuthResult>(
      LoginMapper.map(dto, clientIp),
    );
    return toSessionRes(result);
  }

  /**
   * Exchanges the refresh cookie for a new access token. A rotation sets a new
   * cookie; a grace-window answer leaves the cookie unchanged.
   */
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @RefreshToken() refreshToken: RefreshTokenDto,
    @Ip() clientIp: string,
  ): Promise<SessionResponse> {
    const result = await this.principalLoginService.refresh(
      refreshToken,
      clientIp,
    );
    return toSessionRes(result);
  }

  /**
   * Revokes the session of the refresh cookie and clears the cookies. An
   * unknown or missing cookie still answers 204. An issued access token stays
   * valid until it expires.
   */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @RefreshToken({ optional: true }) refreshToken: RefreshTokenDto | undefined,
    @Ip() clientIp: string,
  ): Promise<void> {
    try {
      await this.commandBus.execute(
        new RevokeAuthCommand({ refreshToken, clientIp }),
      );
    } catch (error) {
      if (!(error instanceof InvalidRefreshTokenError)) throw error;
    }
  }
}
