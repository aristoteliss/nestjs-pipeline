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
import { FilterQuery } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { User, UserSnapshot } from '../domain/models/user.entity';

function buildConditions(query: GetUserQuery): Record<string, unknown> {
  const conditions: Record<string, unknown> = query.userId
    ? { _id: query.userId }
    : { email: query.email };

  if (query.department) conditions._department = query.department;

  return conditions;
}

@Injectable()
export class GetUserQueryRepository extends QueryRepository<
  GetUserQuery,
  User | null
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<User>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @Cache<GetUserQuery, User>(
    (q) => filterCacheKey(User, buildConditions(q)),
    (cached) => User.fromJSON(cached as UserSnapshot),
  )
  async find(query: GetUserQuery): Promise<User | null> {
    const conditions = buildConditions(query);

    return this.store.em.findOne(User, conditions as FilterQuery<User>);
  }
}
