import { Body, Controller, Get, Param, Post, Patch, Req } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateUserCommand } from './commands/create-user.command';
import { UpdateUserCommand } from './commands/update-user.command';
import { GetUserQuery } from './queries/get-user.query';
import { UserDto } from './commands/create-user.handler';
import { GetUsersQuery } from './queries/get-users.query';

class CreateUserDto {
  name!: string;
  email!: string;
}

class UpdateUserDto {
  name!: string;
}

@Controller('users')
export class UsersController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  async getUsers(
    @Req() _request: Request,
  ): Promise<{ users: UserDto[] }> {
    return {
      users: await this.queryBus.execute(new GetUsersQuery())
    };
  }

  @Get(':id')
  getUser(@Param('id') id: string): Promise<UserDto> {
    return this.queryBus.execute(new GetUserQuery(id));
  }

  @Post()
  createUser(@Body() dto: CreateUserDto): Promise<UserDto> {
    return this.commandBus.execute(new CreateUserCommand(dto.name, dto.email));
  }

  @Patch(':id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto): Promise<UserDto> {
    return this.commandBus.execute(new UpdateUserCommand(id, dto.name));
  }
}
