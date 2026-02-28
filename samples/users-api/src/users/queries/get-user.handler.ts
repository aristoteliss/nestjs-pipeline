import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { NotFoundException } from '@nestjs/common';
import { GetUserQuery } from './get-user.query';
import { UserDto, usersStore } from '../commands/create-user.handler';

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery, UserDto> {
  async execute(query: GetUserQuery): Promise<UserDto> {
    const user = usersStore.get(query.userId);
    if (!user) {
      throw new NotFoundException(`User ${query.userId} not found`);
    }
    return user;
  }
}
