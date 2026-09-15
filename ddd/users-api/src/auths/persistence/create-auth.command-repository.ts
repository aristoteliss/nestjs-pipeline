/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import {
  AcknowledgePersisted,
  CACHE_TOKEN,
  Cache,
  CommandRepository,
  filterCacheKey,
  ICache,
} from '@nestjs-pipeline/ddd-core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { Auth, AuthSnapshot } from '../domain/models/auth.entity';

@Injectable()
export class CreateAuthCommandRepository extends CommandRepository<
  Auth,
  AuthSnapshot
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<AuthSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  @Cache<Auth, AuthSnapshot>((auth) =>
    filterCacheKey(Auth.aggregateName, { id: auth.id }),
  )
  @AcknowledgePersisted<[Auth]>({ entity: ([auth]) => auth })
  async save(auth: Auth): Promise<AuthSnapshot> {
    const persisted = await this.store.em.upsert(Auth, auth);

    return persisted.toJSON();
  }
}
