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

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { CreateUserHandler } from './cqrs/commands/create-user.handler';
import { DeleteUserHandler } from './cqrs/commands/delete-user.handler';
import { UpdateUserHandler } from './cqrs/commands/update-user.handler';
import { UserCreatedHandler } from './cqrs/events/user-created.handler';
import { UserDeletedHandler } from './cqrs/events/user-deleted.handler';
import { UserUpdatedHandler } from './cqrs/events/user-updated.handler';
import { GetUserHandler } from './cqrs/queries/get-user.handler';
import { GetUsersHandler } from './cqrs/queries/get-uses.handler';
import { MemoryStore } from './db/memory-store';
import {
  BATCH_UPDATE_USERS_QUEUE,
  BatchUpdateUsersProcessor,
} from './jobs/batch-update-users.processor';
import {
  SendWelcomeEmailProcessor,
  WELCOME_EMAIL_QUEUE,
} from './jobs/send-welcome-email.processor';
import { CreateUserPersistence } from './persistence/create-user.persistence';
import { DeleteUserPersistence } from './persistence/delete-user.persistence';
import { GetUserRetrieve } from './persistence/get-user.retrieve';
import { GetUsersRetrieve } from './persistence/get-users.retrieve';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from './persistence/persistence.tokens';
import { UpdateUserPersistence } from './persistence/update-user.persistence';
import { InMemoryUserRepository } from './repositories/in-memory-user.repository';
import { USER_REPOSITORY } from './repositories/user.repository.interface';

@Module({
  imports: [
    BullModule.registerQueue({ name: WELCOME_EMAIL_QUEUE }),
    BullModule.registerQueue({ name: BATCH_UPDATE_USERS_QUEUE }),
  ],
  controllers: [UsersController],
  providers: [
    MemoryStore,

    // Repository
    { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },

    // Repositories (Command)
    {
      provide: COMMAND_REPOSITORY.createUser,
      useClass: CreateUserPersistence,
    },
    {
      provide: COMMAND_REPOSITORY.updateUser,
      useClass: UpdateUserPersistence,
    },
    {
      provide: COMMAND_REPOSITORY.deleteUser,
      useClass: DeleteUserPersistence,
    },

    // Repositories (Query)
    { provide: QUERY_REPOSITORY.getUser, useClass: GetUserRetrieve },
    { provide: QUERY_REPOSITORY.getUsers, useClass: GetUsersRetrieve },

    // Queries
    GetUserHandler,
    GetUsersHandler,

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
export class UsersModule {}
