import { Client } from '@libsql/client';
import { Inject, Injectable } from '@nestjs/common';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { TURSO_CLIENT } from '@persistence/turso-store';
import { GetUsersQuery } from '../cqrs/queries/get-users.query';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class GetUsersQueryRepository
  implements IQueryRepository<GetUsersQuery, User[]>
{
  constructor(@Inject(TURSO_CLIENT) private readonly client: Client) {}

  async find(_query: GetUsersQuery): Promise<User[]> {
    const users = await this.client.execute(
      `SELECT id, username, email, tenant_id, department, created_at, updated_at FROM users`,
    );

    return users.rows.map((row) => {
      const snapshot: UserSnapshot = {
        id: row.id as string,
        username: row.username as string,
        email: row.email as string,
        tenantId: row.tenant_id as string | undefined,
        department: row.department as string | undefined,
        createdAt: new Date(row.created_at as number),
        updatedAt: new Date(row.updated_at as number),
      };
      return User.fromJSON(snapshot);
    });
  }
}
