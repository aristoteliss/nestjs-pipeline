import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { GetUsersQuery } from './get-users.query';
import { User } from '../../domain/user.entity';
import { IUserRepository, USER_REPOSITORY } from '../../repositories/user.repository.interface';

@QueryHandler(GetUsersQuery)
export class GetUsersHandler implements IQueryHandler<GetUsersQuery, User[]> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
  ) {}

  async execute(_query: GetUsersQuery): Promise<User[]> {
    return this.userRepository.findAll();
  }
}
