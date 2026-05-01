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

import { Module } from '@nestjs/common';
import { AuthsController } from './controllers/auths.controller';
import { CreateAuthHandler } from './cqrs/commands/create-auth.handler';
import { DeleteAuthHandler } from './cqrs/commands/delete-auth.handler';
import { CreatedAuthHandler } from './cqrs/events/auth-login.handler';
import { GetUserCapabilitiesHandler } from './cqrs/queries/get-user-capabilities.handler';
import { CreateAuthCommandRepository } from './repositories/create-auth.command-repository';
import { GetUserCapabilitiesQueryRepository } from './repositories/get-user-capabilities.query-repository';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from './repositories/repository.tokens';
import { AuthService } from './services/auth.serivce';

@Module({
  controllers: [AuthsController],
  providers: [
    // Repositories (Query)
    {
      provide: QUERY_REPOSITORY.getUserCapabilities,
      useClass: GetUserCapabilitiesQueryRepository,
    },

    // Repositories (Commnad)
    {
      provide: COMMAND_REPOSITORY.createAuth,
      useClass: CreateAuthCommandRepository,
    },

    AuthService,

    // Commands
    CreateAuthHandler,
    DeleteAuthHandler,

    // Queries
    GetUserCapabilitiesHandler,

    // Events
    CreatedAuthHandler,
  ],
})
export class AuthsModule { }
