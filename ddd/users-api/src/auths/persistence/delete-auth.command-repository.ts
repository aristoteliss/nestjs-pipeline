/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import {
  CACHE_TOKEN,
  Cache,
  CommandRepository,
  filterCacheKey,
  type ICache,
} from '@nestjs-pipeline/ddd-core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { Auth, type AuthSnapshot } from '../domain/models/auth.entity';

/**
 * Command repository for revoking persistent authentication aggregates.
 *
 * Deletes the `Auth` entity by primary key (`{ id: auth.id }`) and evicts
 * its corresponding cache entry (`auth:id:<auth.id>`) via the `@Cache` decorator.
 */
@Injectable()
export class DeleteAuthCommandRepository extends CommandRepository<Auth, null> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<AuthSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @Cache<Auth, null>(null, (auth) => [
    filterCacheKey(Auth.aggregateName, { id: auth.id }),
  ])
  async save(auth: Auth): Promise<null> {
    await this.store.em.nativeDelete(Auth, { id: auth.id });
    return null;
  }
}
