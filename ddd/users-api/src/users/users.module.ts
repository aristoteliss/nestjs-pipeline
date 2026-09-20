/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { GetUserCapabilitiesQueryRepository } from '../auths/persistence/get-user-capabilities.query-repository';
import {
  USER_BATCH_DISPATCHER,
  WELCOME_EMAIL_DISPATCHER,
} from './application/ports/user-event-dispatcher.port';
import { UsersController } from './controllers/users.controller';
import { CreateUserHandler } from './cqrs/commands/create-user.handler';
import { DeleteUserHandler } from './cqrs/commands/delete-user.handler';
import { UpdateUserHandler } from './cqrs/commands/update-user.handler';
import { UserCreatedHandler } from './cqrs/events/user-created.handler';
import { UserUpdatedHandler } from './cqrs/events/user-updated.handler';
import { GetUserHandler } from './cqrs/queries/get-user.handler';
import { GetUserContextHandler } from './cqrs/queries/get-user-context.handler';
import { GetUserOverviewHandler } from './cqrs/queries/get-user-overview.handler';
import { GetUsersHandler } from './cqrs/queries/get-users.handler';
import {
  BATCH_UPDATE_USERS_QUEUE,
  BatchUpdateUsersProcessor,
} from './jobs/batch-update-users.processor';
import { BullMqUserEventDispatcher } from './jobs/bullmq-user-event-dispatcher.adapter';
import {
  SendWelcomeEmailProcessor,
  WELCOME_EMAIL_QUEUE,
} from './jobs/send-welcome-email.processor';
import { CreateUserCommandRepository } from './persistence/create-user.command-repository';
import { DeleteUserCommandRepository } from './persistence/delete-user.command-repository';
import { GetUserQueryRepository } from './persistence/get-user.query-repository';
import { GetUserContextQueryRepository } from './persistence/get-user-context.query-repository';
import { GetUsersQueryRepository } from './persistence/get-users.query-repository';
import {
  COMMAND_REPOSITORY,
  QUERY_REPOSITORY,
} from './persistence/repository.tokens';
import { UpdateUserCommandRepository } from './persistence/update-user.command-repository';

@Module({
  imports: [
    LoggerModule,
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
