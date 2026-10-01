/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import {
  CACHE_TOKEN,
  cacheKey,
  FromCache,
  QueryRepository,
} from '@cqrs-ddd/core/persistence';
import { FilterQuery } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import { cacheReadLogger } from '@persistence/cache/cache-loggers.js';
import {
  MIKRO_ORM_CLIENT,
  MikroOrmStore,
} from '@persistence/mikro-orm.store.js';
import { GetUserQuery } from '../application/cqrs/queries/get-user.query.js';
import { User, UserSnapshot } from '../domain/models/user.entity.js';

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
    super(cache, {
      hydrateFn: (cached) => User.fromJSON(cached as UserSnapshot),
    });
  }

  @FromCache<GetUserQuery, User | null>({
    logger: cacheReadLogger,
    keyFn: (q) =>
      q.department ? null : cacheKey(User.aggregateName, buildConditions(q)),
  })
  async find(query: GetUserQuery): Promise<User | null> {
    const conditions = buildConditions(query);

    return this.store.em.findOne(
      User,
      conditions as FilterQuery<User>,
      query.refresh ? { refresh: true } : undefined,
    );
  }
}
