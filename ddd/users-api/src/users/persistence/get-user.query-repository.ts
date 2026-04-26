import { Client } from '@libsql/client';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { TURSO_CLIENT } from '@persistence/turso-store';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { User, UserSnapshot } from '../domain/models/user.entity';

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
    (q) =>
      q.userId
        ? `${User.prefixKey}${q.userId}`
        : `${User.prefixKey}email:${q.email}`,
    (cached) => User.fromJSON(cached as UserSnapshot),
  )
  async find(query: GetUserQuery): Promise<User> {
    const { userId, email } = query;

    const sql = userId
      ? `SELECT id, username, email, tenant_id, department, created_at, updated_at FROM users WHERE id = ?`
      : `SELECT id, username, email, tenant_id, department, created_at, updated_at FROM users WHERE email = ?`;
    const arg = userId ?? email;

    if (!arg) {
      throw new NotFoundException('Either userId or email is required');
    }

    const user = await this.client.execute({
      sql,
      args: [arg],
    });

    if (!user.rows.length) {
      throw new NotFoundException('User not found');
    }

    const row = user.rows[0];
    const snapshot: UserSnapshot = {
      id: row.id as string,
      username: row.username as string,
      email: row.email as string,
      tenantId: row.tenant_id as string,
      department: row.department as string | null,
      createdAt: new Date(row.created_at as number),
      updatedAt: new Date(row.updated_at as number),
    };

    return User.fromJSON(snapshot);
  }
}
