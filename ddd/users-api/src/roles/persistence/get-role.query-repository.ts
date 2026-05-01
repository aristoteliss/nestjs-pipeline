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

import { Client } from '@libsql/client';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { TURSO_CLIENT } from '@persistence/turso-store';
import { GetRoleQuery } from '../cqrs/queries/get-role.query';
import { Role, RoleSnapshot } from '../domain/models/role.entity';

@Injectable()
export class GetRoleQueryRepository extends QueryRepository<
  GetRoleQuery,
  Role
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<Role>,
    @Inject(TURSO_CLIENT) private readonly client: Client,
  ) {
    super(cache);
  }

  @Cache<GetRoleQuery, Role>(
    (q) => `${Role.prefixKey}${q.roleId}`,
    (cached) => Role.fromJSON(cached as RoleSnapshot),
  )
  async find(query: GetRoleQuery): Promise<Role> {
    const { roleId } = query;

    const role = await this.client.execute({
      sql: `SELECT id, name, created_at, updated_at FROM roles WHERE id = ?`,
      args: [roleId],
    });

    if (!role.rows.length) {
      throw new NotFoundException('Role not found');
    }

    const row = role.rows[0];
    const snapshot: RoleSnapshot = {
      id: row.id as string,
      name: row.name as string,
      createdAt: new Date(row.created_at as number),
      updatedAt: new Date(row.updated_at as number),
    };

    return Role.fromJSON(snapshot);
  }
}
