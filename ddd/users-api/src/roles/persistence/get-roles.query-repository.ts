import { Client } from '@libsql/client';
import { Inject, Injectable } from '@nestjs/common';
import { IQueryRepository } from '@nestjs-pipeline/ddd-core';
import { TURSO_CLIENT } from '@persistence/turso-store';
import { GetRolesQuery } from '../cqrs/queries/get-roles.query';
import { Role, RoleSnapshot } from '../domain/models/role.entity';

@Injectable()
export class GetRolesQueryRepository
  implements IQueryRepository<GetRolesQuery, Role[]>
{
  constructor(@Inject(TURSO_CLIENT) private readonly client: Client) {}

  async find(_query: GetRolesQuery): Promise<Role[]> {
    const roles = await this.client.execute(
      `SELECT id, name, created_at, updated_at FROM roles`,
    );

    return roles.rows.map((row) => {
      const snapshot: RoleSnapshot = {
        id: row.id as string,
        name: row.name as string,
        createdAt: new Date(row.created_at as number),
        updatedAt: new Date(row.updated_at as number),
      };
      return Role.fromJSON(snapshot);
    });
  }
}
