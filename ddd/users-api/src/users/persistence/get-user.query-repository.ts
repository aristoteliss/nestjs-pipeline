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

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cache, ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { GetUserQuery } from '../cqrs/queries/get-user.query';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class GetUserQueryRepository extends QueryRepository<
  GetUserQuery,
  User
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<User>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @Cache<GetUserQuery, User>(
    (q) =>
      q.userId
        ? `${User.prefixKey}${q.userId}`
        : `${User.prefixKey}email:${q.email}`,
    (cached) => User.fromJSON(cached as UserSnapshot),
  )
  async find(query: GetUserQuery): Promise<User> {
    const { userId, email } = query;

    const where = userId ?? { email };
    const user = await this.store.em.findOne(
      User,
      where as Parameters<typeof this.store.em.findOne<User>>[1],
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}
