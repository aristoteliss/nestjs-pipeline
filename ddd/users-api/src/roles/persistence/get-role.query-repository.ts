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

import { filterCacheKey } from '@common/cqrs/helpers/filterCacheKey.helper';
import { Inject, Injectable } from '@nestjs/common';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetRoleQuery } from '../cqrs/queries/get-role.query';
import { Role, RoleSnapshot } from '../domain/models/role.entity';

function buildConditions(query: GetRoleQuery): Record<string, unknown> {
  return { id: query.roleId };
}

@Injectable()
export class GetRoleQueryRepository extends QueryRepository<
  GetRoleQuery,
  Role | null
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<Role>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @Cache<GetRoleQuery, Role>(
    (q) => filterCacheKey(Role, buildConditions(q)),
    (cached) => Role.fromJSON(cached as RoleSnapshot),
  )
  async find(query: GetRoleQuery): Promise<Role | null> {

    const role = await this.store.em.findOne(Role, buildConditions(query));

    return role;
  }
}
