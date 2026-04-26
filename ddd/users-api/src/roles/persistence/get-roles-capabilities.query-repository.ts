import type { Client } from '@libsql/client';
import { Inject, Injectable } from '@nestjs/common';
import type { IRoleProvider, RoleDefinition } from '@nestjs-pipeline/casl';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { TURSO_CLIENT } from '@persistence/turso-store';
import { GetRolesCapabilitiesQuery } from '../cqrs/queries/get-roles-capabilities.query';

@Injectable()
export class GetRolesCapabilitiesQueryRepository
  extends QueryRepository<GetRolesCapabilitiesQuery, RoleDefinition[]>
  implements IRoleProvider
{
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleDefinition[]>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  async getRoles(names?: string[]): Promise<RoleDefinition[]> {
    return this.find(new GetRolesCapabilitiesQuery({ names }));
  }

  @Cache<GetRolesCapabilitiesQuery, RoleDefinition[]>(
    (q) => `roles:capabilities:${q.names?.sort().join(',') ?? 'all'}`,
  )
  async find(query: GetRolesCapabilitiesQuery): Promise<RoleDefinition[]> {
    const { names } = query;
    let rows: Array<{ id: string; name: string }> = [];

    if (names && names.length > 0) {
      const placeholders = names.map(() => '?').join(',');
      const result = await this.client.execute({
        sql: `SELECT id, name FROM roles WHERE name IN (${placeholders})`,
        args: names,
      });
      rows = result.rows.map((r) => ({
        id: r.id as string,
        name: r.name as string,
      }));
    } else {
      // If no role names are provided, return an empty array (no roles)
      return [];
    }

    return this.hydrate(rows);
  }

  private async hydrate(
    rows: Array<{ id: string; name: string }>,
  ): Promise<RoleDefinition[]> {
    if (rows.length === 0) return [];

    const roleIds = rows.map((r) => r.id);
    const placeholders = roleIds.map(() => '?').join(',');

    const caps = await this.client.execute({
      sql: `SELECT rc.role_id,
                   c.subject, c.action, c.conditions,
                   c.inverted, c.reason, c.fields
            FROM role_capabilities rc
            JOIN capabilities c ON c.id = rc.capability_id
            WHERE rc.role_id IN (${placeholders})`,
      args: roleIds,
    });

    const capsByRole = new Map<string, RoleDefinition['capabilities']>();
    for (const row of caps.rows) {
      const roleId = row.role_id as string;
      if (!capsByRole.has(roleId)) capsByRole.set(roleId, []);

      // biome-ignore lint/style/noNonNullAssertion: checked on previous line
      capsByRole.get(roleId)!.push({
        subject: row.subject as string,
        action: row.action as string,
        conditions: row.conditions
          ? JSON.parse(row.conditions as string)
          : undefined,
        inverted: row.inverted === 1,
        reason: (row.reason as string) || undefined,
        fields: row.fields ? (row.fields as string).split(',') : undefined,
      });
    }

    return rows.map((r) => ({
      name: r.name,
      capabilities: capsByRole.get(r.id) ?? [],
    }));
  }
}
