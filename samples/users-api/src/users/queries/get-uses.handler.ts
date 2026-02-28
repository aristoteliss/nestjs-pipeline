import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { UserDto, usersStore } from '../commands/create-user.handler';
import { GetUsersQuery } from './get-users.query';

@QueryHandler(GetUsersQuery)
export class GetUsersHandler implements IQueryHandler<GetUsersQuery, UserDto[]> {
  async execute(_query: GetUsersQuery): Promise<UserDto[]> {
    return Array.from(usersStore.values());
  }
}
