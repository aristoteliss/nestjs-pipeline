import { Injectable } from '@nestjs/common';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { MemoryStore } from '../db/memory-store';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class GetUserQueryRepository
  implements IQueryRepository<GetUserQuery, User>
{
  constructor(private readonly store: MemoryStore<UserSnapshot>) {}

  async find(query: GetUserQuery): Promise<User> {
    const { userId } = query;

    const user = await this.store.get(userId);

    if (!user) {
      throw new Error('User not found');
    }

    return User.fromJSON(user);
  }
}
