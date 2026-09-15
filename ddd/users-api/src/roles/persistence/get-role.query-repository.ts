/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import {
  CACHE_TOKEN,
  FromCache,
  filterCacheKey,
  ICache,
  QueryRepository,
} from '@nestjs-pipeline/ddd-core';
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
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @FromCache<GetRoleQuery, Role | null>({
    keyFn: (q) => filterCacheKey(Role.aggregateName, buildConditions(q)),
    hydrateFn: (cached) => Role.fromJSON(cached as RoleSnapshot),
    alwaysHydrate: true,
  })
  async find(query: GetRoleQuery): Promise<Role | null> {
    const role = await this.store.em.findOne(Role, buildConditions(query));

    return role;
  }
}
