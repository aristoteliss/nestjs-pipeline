import { Client } from '@libsql/client';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  Cache,
  CacheableEntity,
  ICache,
  QueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { TURSO_CLIENT } from '../db/turso-store';
import { User, UserSnapshot } from '../domain/models/user.entity';
import { CACHE_TOKEN } from './cache/memory.cache';

@Injectable()
export class GetUserQueryRepository extends QueryRepository<
  GetUserQuery,
  User
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<User>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  @Cache<GetUserQuery, User>(
    (q) => `${User.prefixKey}${q.userId}`,
    (cached) => User.fromJSON(cached as UserSnapshot),
  )
  async find(query: GetUserQuery): Promise<User> {
    const { userId } = query;

    const user = await this.client.execute({
      sql: `SELECT data FROM users WHERE id = ?`,
      args: [userId],
    });

    if (!user || !user.rows || user.rows.length === 0) {
      throw new NotFoundException('User not found');
    }

    return CacheableEntity.fromStringify<UserSnapshot, User>(
      user.rows[0].data as string,
      User.fromJSON,
    );
  }
}
