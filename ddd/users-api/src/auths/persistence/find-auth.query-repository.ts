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
import { ICache, QueryRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { FindAuthQuery } from '../cqrs/queries/find-auth.query';
import { Auth } from '../domain/models/auth.entity';

@Injectable()
export class FindAuthQueryRepository extends QueryRepository<
  FindAuthQuery,
  Auth | null
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<Auth>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  async find(query: FindAuthQuery): Promise<Auth | null> {
    const userId = String(query.userId);
    const filter: Record<string, unknown> = { userId };
    if (query.token) {
      filter.token = query.token;
    }

    return this.store.em.findOne(Auth, filter as FilterQuery<Auth>);
  }
}
