import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { CreateUserHandler } from './commands/create-user.handler';
import { GetUserHandler } from './queries/get-user.handler';
import { UserCreatedHandler } from './events/user-created.handler';
import { GetUsersHandler } from './queries/get-uses.handler';

@Module({
  controllers: [UsersController],
  providers: [GetUserHandler, GetUsersHandler, CreateUserHandler, UserCreatedHandler],
})
export class UsersModule {}
