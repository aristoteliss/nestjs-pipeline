import { Client } from '@libsql/client';
import { Inject, Injectable } from '@nestjs/common';
import { CacheableEntity, IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { GetUsersQuery } from '../cqrs/queries/get-users.query';
import { TURSO_CLIENT } from '../db/turso-store';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class GetUsersQueryRepository
  implements IQueryRepository<GetUsersQuery, User[]>
{
  constructor(@Inject(TURSO_CLIENT) private readonly client: Client) {}

  async find(_query: GetUsersQuery): Promise<User[]> {
    const users = await this.client.execute(`SELECT data FROM users`);

    return users.rows.map((row) =>
      CacheableEntity.fromStringify<UserSnapshot, User>(
        row.data as string,
        User.fromJSON,
      ),
    );
  }
}
