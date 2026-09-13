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
