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

import { SessionData, SessionUser } from '@common/types/SessionUser';
import { Session } from '@fastify/secure-session';
import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ZodPipe } from '@nestjs-pipeline/zod';
import { CreateAuthCommand } from '../cqrs/commands/create-auth.command';
import { DeleteAuthCommand } from '../cqrs/commands/delete-auth.command';
import { LoginDto, LoginDtoSchema } from '../dtos/login.dto';
import { LoginMapper } from '../mappers/login.mapper';

@Controller('auth')
export class AuthsController {
  constructor(private readonly commandBus: CommandBus) {}

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
  ): Promise<SessionUser> {
    const sessionData = await this.commandBus.execute<
      CreateAuthCommand,
      SessionUser & { token: string }
    >(LoginMapper.map(dto));

    if (req.session) {
      req.session.user = {
        id: sessionData.id,
        tenant: sessionData.tenant,
        email: sessionData.email,
        department: sessionData.department,
        capabilities: sessionData.capabilities,
      };
    }

    return sessionData;
  }

  /**
   * Clears the current Fastify secure-session cookie when present. Under
   * Express there is no server session to delete; clients discard their bearer
   * token.
   */
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: { session?: Session<SessionData> }): Promise<void> {
    const sessionUser = req.session?.user;

    await this.commandBus.execute(new DeleteAuthCommand(sessionUser));

    req.session?.delete();
  }
}
