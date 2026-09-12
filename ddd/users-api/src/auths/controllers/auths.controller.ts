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

import { SessionData } from '@common/types/SessionUser';
import { Session } from '@fastify/secure-session';
import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ZodPipe } from '@nestjs-pipeline/zod';
import { CreateAuthCommand } from '../cqrs/commands/create-auth.command';
import { DeleteAuthCommand } from '../cqrs/commands/delete-auth.command';
import { CreateAuthResult } from '../cqrs/results/create-auth.result';
import { LoginDto, LoginDtoSchema } from '../dtos/login.dto';
import { LoginMapper } from '../mappers/login.mapper';
import { toSessionRes } from '../mappers/session.mapper';
import { SessionResponse } from '../responses/session.res';
import { SessionService } from '../services/session.service';
import { UserLoginService } from '../services/user-login.service';

@Controller('auth')
export class AuthsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly userLoginService: UserLoginService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Authenticates a user and creates the Auth domain aggregate.
   * On success, returns a bearer token in the auth response. When the Fastify
   * adapter has decorated the request with `@fastify/secure-session`, it also
   * populates the secure session cookie. Express intentionally has no session
   * object in this sample, so callers use the returned bearer token there.
   */
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodPipe(LoginDtoSchema)) dto: LoginDto,
    @Req() req: { session?: Session<SessionData> },
  ): Promise<SessionResponse> {
    const result = await this.commandBus.execute<
      CreateAuthCommand,
      CreateAuthResult
    >(LoginMapper.map(dto));

    const sessionRes = toSessionRes(result);

    this.sessionService.saveSession(req.session, sessionRes);

    return sessionRes;
  }

  /**
   * Logs out the current session.
   *
   * Accepts raw session and headers, delegates extraction of userId and token
   * to the authentication service, dispatches `DeleteAuthCommand` to revoke
   * the persistent auth aggregate and evict cache, and clears the session cookie.
   */
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req()
    req: {
      session?: Session<SessionData>;
      headers?: Record<string, string | string[] | undefined>;
    },
  ): Promise<void> {
    const { userId, token } = await this.userLoginService.extractCredentials(
      req.session,
      req.headers,
    );

    if (userId && token) {
      await this.commandBus.execute(new DeleteAuthCommand({ userId, token }));
    }

    this.sessionService.clearSession(req.session);
  }
}
