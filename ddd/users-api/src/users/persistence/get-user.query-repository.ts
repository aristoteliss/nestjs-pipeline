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

import { FilterQuery } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import {
  CACHE_TOKEN,
  FromCache,
  filterCacheKey,
  ICache,
  QueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { User, UserSnapshot } from '../domain/models/user.entity';

function buildConditions(query: GetUserQuery): Record<string, unknown> {
  const conditions: Record<string, unknown> = query.userId
    ? { id: query.userId }
    : { email: query.email };

  if (query.department) conditions.department = query.department;

  return conditions;
}

@Injectable()
export class GetUserQueryRepository extends QueryRepository<
  GetUserQuery,
  User | null
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @FromCache<GetUserQuery, User | null>({
    // `department` is mutable. A cached composite lookup containing the old
    // department cannot be invalidated from the post-update entity because the
    // previous department is no longer available. Keep stable id/email lookups
    // cached, but execute mutable department-filtered lookups directly.
    keyFn: (q) =>
      q.department
        ? null
        : filterCacheKey(User.aggregateName, buildConditions(q)),
    hydrateFn: (cached) => User.fromJSON(cached as UserSnapshot),
    alwaysHydrate: true,
  })
  async find(query: GetUserQuery): Promise<User | null> {
    const conditions = buildConditions(query);

    return this.store.em.findOne(User, conditions as FilterQuery<User>);
  }
}
