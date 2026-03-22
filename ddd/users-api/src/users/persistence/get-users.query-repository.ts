import { Injectable } from '@nestjs/common';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { GetUsersQuery } from '../cqrs/queries/get-users.query';
import { MemoryStore } from '../db/memory-store';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class GetUsersQueryRepository
  implements IQueryRepository<GetUsersQuery, User[]>
{
  constructor(private readonly store: MemoryStore<UserSnapshot>) {}

  async find(_query: GetUsersQuery): Promise<User[]> {
    const users = await this.store.getAll();

    return users.map(User.fromJSON);
  }
}
