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
import { Module } from '@nestjs/common';
import { UsersController } from './controllers/users.controller';
import { CreateUserHandler } from './cqrs/commands/create-user.handler';
import { UpdateUserHandler } from './cqrs/commands/update-user.handler';
import { GetUserHandler } from './cqrs/queries/get-user.handler';
import { UserCreatedHandler } from './cqrs/events/user-created.handler';
import { DeleteUserHandler } from './cqrs/commands/delete-user.handler';
import { GetUsersHandler } from './cqrs/queries/get-uses.handler';
import { InMemoryUserRepository } from './repositories/in-memory-user.repository';
import { USER_REPOSITORY } from './repositories/user.repository.interface';

@Module({
  controllers: [UsersController],
  providers: [
    // Repository
    { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },

    // Queries
    GetUserHandler,
    GetUsersHandler,

    // Commands
    CreateUserHandler,
    UpdateUserHandler,
    DeleteUserHandler,

    // Events
    UserCreatedHandler,
  ],
})
export class UsersModule {}
