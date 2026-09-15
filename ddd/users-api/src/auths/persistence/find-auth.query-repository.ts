/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { FilterQuery } from '@mikro-orm/core';
import { Inject, Injectable } from '@nestjs/common';
import {
  CACHE_TOKEN,
  ICache,
  QueryRepository,
} from '@nestjs-pipeline/ddd-core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { FindAuthQuery } from '../cqrs/queries/find-auth.query';
import { Auth, type AuthSnapshot } from '../domain/models/auth.entity';

@Injectable()
export class FindAuthQueryRepository extends QueryRepository<
  FindAuthQuery,
  Auth | null
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<AuthSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  async find(query: FindAuthQuery): Promise<Auth | null> {
    const userId = String(query.userId);
    const filter: Record<string, unknown> = {
      userId,
      token: query.token,
    };

    return this.store.em.findOne(Auth, filter as FilterQuery<Auth>);
  }
}
