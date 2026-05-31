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

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { GetUserCapabilitiesQueryRepository } from '../auths/repositories/get-user-capabilities.query-repository';
import { UsersController } from './controllers/users.controller';
import { CreateUserHandler } from './cqrs/commands/create-user.handler';
import { DeleteUserHandler } from './cqrs/commands/delete-user.handler';
import { UpdateUserHandler } from './cqrs/commands/update-user.handler';
import { UserCreatedHandler } from './cqrs/events/user-created.handler';
import { UserDeletedHandler } from './cqrs/events/user-deleted.handler';
import { UserUpdatedHandler } from './cqrs/events/user-updated.handler';
import { GetUserHandler } from './cqrs/queries/get-user.handler';
import { GetUserContextHandler } from './cqrs/queries/get-user-context.handler';
import { GetUsersHandler } from './cqrs/queries/get-uses.handler';
import {
  BATCH_UPDATE_USERS_QUEUE,
  BatchUpdateUsersProcessor,
} from './jobs/batch-update-users.processor';
import {
  SendWelcomeEmailProcessor,
  WELCOME_EMAIL_QUEUE,
} from './jobs/send-welcome-email.processor';
import { CreateUserCommandRepository } from './persistence/create-user.command-repository';
import { DeleteUserCommandRepository } from './persistence/delete-user.command-repository';
import { GetUserQueryRepository } from './persistence/get-user.query-repository';
import { GetUserContextQueryRepository } from './persistence/get-user-context.query-repository';
import { GetUsersQueryRepository } from './persistence/get-users.query-repository';
import { UpdateUserCommandRepository } from './persistence/update-user.command-repository';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from './repositories/repository.tokens';

@Module({
  imports: [
    LoggerModule,
    BullModule.registerQueue({ name: WELCOME_EMAIL_QUEUE }),
    BullModule.registerQueue({ name: BATCH_UPDATE_USERS_QUEUE }),
  ],
  controllers: [UsersController],
  providers: [
    // Repositories (Command)
    {
      provide: COMMAND_REPOSITORY.createUser,
      useClass: CreateUserCommandRepository,
    },
    {
      provide: COMMAND_REPOSITORY.updateUser,
      useClass: UpdateUserCommandRepository,
    },
    {
      provide: COMMAND_REPOSITORY.deleteUser,
      useClass: DeleteUserCommandRepository,
    },

    // Repositories (Query)
    { provide: QUERY_REPOSITORY.getUser, useClass: GetUserQueryRepository },
    { provide: QUERY_REPOSITORY.getUsers, useClass: GetUsersQueryRepository },
    {
      provide: QUERY_REPOSITORY.getUserContext,
      useClass: GetUserContextQueryRepository,
    },
    {
      provide: QUERY_REPOSITORY.getUserCapabilities,
      useClass: GetUserCapabilitiesQueryRepository,
    },

    // Queries
    GetUserHandler,
    GetUsersHandler,
    GetUserContextHandler,

    // Commands
    CreateUserHandler,
    UpdateUserHandler,
    DeleteUserHandler,

    // Events
    UserCreatedHandler,
    UserUpdatedHandler,
    UserDeletedHandler,

    // Job Processors
    SendWelcomeEmailProcessor,
    BatchUpdateUsersProcessor,
  ],
})
export class UsersModule { }
