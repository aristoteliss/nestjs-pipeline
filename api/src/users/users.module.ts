/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { GetRolesQueryRepository } from '../roles/persistence/get-roles.query-repository.js';
import { QUERY_REPOSITORY as ROLES_QUERY_REPOSITORY } from '../roles/persistence/repository.tokens.js';
import { CreateUserHandler } from './application/cqrs/commands/create-user.handler.js';
import { DeleteUserHandler } from './application/cqrs/commands/delete-user.handler.js';
import { UpdateUserHandler } from './application/cqrs/commands/update-user.handler.js';
import { UserCreatedHandler } from './application/cqrs/events/user-created.handler.js';
import { UserUpdatedHandler } from './application/cqrs/events/user-updated.handler.js';
import { GetUserHandler } from './application/cqrs/queries/get-user.handler.js';
import { GetUserOverviewHandler } from './application/cqrs/queries/get-user-overview.handler.js';
import { GetUsersHandler } from './application/cqrs/queries/get-users.handler.js';
import {
  USER_BATCH_DISPATCHER,
  WELCOME_EMAIL_DISPATCHER,
} from './application/ports/user-event-dispatcher.port.js';
import { UsersController } from './controllers/users.controller.js';
import {
  BATCH_UPDATE_USERS_QUEUE,
  BatchUpdateUsersProcessor,
} from './jobs/batch-update-users.processor.js';
import { BullMqUserEventDispatcher } from './jobs/bullmq-user-event-dispatcher.adapter.js';
import {
  SendWelcomeEmailProcessor,
  WELCOME_EMAIL_QUEUE,
} from './jobs/send-welcome-email.processor.js';
import { CreateUserCommandRepository } from './persistence/create-user.command-repository.js';
import { DeleteUserCommandRepository } from './persistence/delete-user.command-repository.js';
import { GetUserQueryRepository } from './persistence/get-user.query-repository.js';
import { GetUserCapabilitiesQueryRepository } from './persistence/get-user-capabilities.query-repository.js';
import { GetUsersQueryRepository } from './persistence/get-users.query-repository.js';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from './persistence/repository.tokens.js';
import { UpdateUserCommandRepository } from './persistence/update-user.command-repository.js';

@Module({
  imports: [
    BullModule.registerQueue({
      name: WELCOME_EMAIL_QUEUE,
      forceDisconnectOnShutdown: true,
    }),
    BullModule.registerQueue({
      name: BATCH_UPDATE_USERS_QUEUE,
      forceDisconnectOnShutdown: true,
    }),
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
      provide: QUERY_REPOSITORY.getUserCapabilities,
      useClass: GetUserCapabilitiesQueryRepository,
    },
    {
      provide: ROLES_QUERY_REPOSITORY.getRoles,
      useClass: GetRolesQueryRepository,
    },

    // Queries
    GetUserHandler,
    GetUsersHandler,
    GetUserOverviewHandler,

    // Commands
    CreateUserHandler,
    UpdateUserHandler,
    DeleteUserHandler,

    // Events
    UserCreatedHandler,
    UserUpdatedHandler,

    // Infrastructure adapters for application event-dispatch ports
    BullMqUserEventDispatcher,
    {
      provide: WELCOME_EMAIL_DISPATCHER,
      useExisting: BullMqUserEventDispatcher,
    },
    {
      provide: USER_BATCH_DISPATCHER,
      useExisting: BullMqUserEventDispatcher,
    },

    // Job Processors
    SendWelcomeEmailProcessor,
    BatchUpdateUsersProcessor,
  ],
})
export class UsersModule {}
