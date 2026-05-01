/*
 * Copyright (C) 2026-present Aristotelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * --- COMMERCIAL EXCEPTION ---
 * Alternatively, a Commercial License is available for individuals or
 * organizations that require proprietary use without the AGPLv3
 * copyleft restrictions.
 *
 * See COMMERCIAL_LICENSE.txt in this repository for the tiered
 * revenue-based terms, or contact: aristotelis@ik.me
 * ----------------------------
 */

import { SqlEntityManager } from '@mikro-orm/libsql';
import { Inject, Injectable } from '@nestjs/common';
import type { IRoleProvider, RoleDefinition } from '@nestjs-pipeline/casl';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetRolesCapabilitiesQuery } from '../cqrs/queries/get-roles-capabilities.query';

@Injectable()
export class GetRolesCapabilitiesQueryRepository
  extends QueryRepository<GetRolesCapabilitiesQuery, RoleDefinition[]>
  implements IRoleProvider {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleDefinition[]>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
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
    const em = this.store.em as SqlEntityManager;
    let rows: Array<{ id: string; name: string }> = [];

    if (names && names.length > 0) {
      const placeholders = names.map(() => '?').join(',');
      const result = await em.execute(
        `SELECT id, name FROM roles WHERE name IN (${placeholders})`,
        names,
      );
      rows = (result as Array<{ id: string; name: string }>).map((r) => ({
        id: r.id as string,
        name: r.name as string,
      }));
    } else {
      // If no role names are provided, return an empty array (no roles)
      return [];
    }

    return this.hydrate(em, rows);
  }

  private async hydrate(
    em: SqlEntityManager,
    rows: Array<{ id: string; name: string }>,
  ): Promise<RoleDefinition[]> {
    if (rows.length === 0) return [];

    const roleIds = rows.map((r) => r.id);
    const placeholders = roleIds.map(() => '?').join(',');

    const caps = await em.execute(
      `SELECT rc.role_id,
                   c.subject, c.action, c.conditions,
                   c.inverted, c.reason, c.fields
            FROM role_capabilities rc
            JOIN capabilities c ON c.id = rc.capability_id
            WHERE rc.role_id IN (${placeholders})`,
      roleIds,
    );

    const capsByRole = new Map<string, RoleDefinition['capabilities']>();
    for (const row of caps as Array<Record<string, unknown>>) {
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
