import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { MemoryStore } from '../db/memory-store';
import { User, UserSnapshot } from '../domain/models/user.entity';
import { CACHE_TOKEN } from './cache/memory.cache';

@Injectable()
export class GetUserQueryRepository extends QueryRepository<
  GetUserQuery,
  User
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<User>,
    private readonly store: MemoryStore<UserSnapshot>,
  ) {
    super(cache);
  }

  @Cache<GetUserQuery, User>(
    (q) => `${User.prefixKey}${q.userId}`,
    (cached) => User.fromJSON(cached as UserSnapshot),
  )
  async find(query: GetUserQuery): Promise<User> {
    const { userId } = query;

    const user = await this.store.get(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return User.fromJSON(user);
  }
}
