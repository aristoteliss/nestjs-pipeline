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
 * companies that do not wish to be bound by the AGPL terms. Contact Aristotelis for details.
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
   * On success, populates the secure session cookie and returns the auth response.
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

    req.session?.set('user', {
      id: sessionData.id,
      email: sessionData.email,
      tenantId: sessionData.tenantId,
      department: sessionData.department,
      capabilities: sessionData.capabilities,
    });

    return sessionData;
  }

  /**
   * Clears the current session cookie, logging the user out.
   */
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: { session?: Session<SessionData> }): Promise<void> {
    const sessionUser = req.session?.get('user');

    await this.commandBus.execute(new DeleteAuthCommand(sessionUser));

    req.session?.delete();
  }
}
