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
