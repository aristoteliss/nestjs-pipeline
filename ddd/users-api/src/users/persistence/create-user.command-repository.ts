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
  MapPersistenceErrors,
} from '@nestjs-pipeline/ddd-core';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { UniqueEmailException } from '../domain/models/errors/email.exception';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class CreateUserCommandRepository extends CommandRepository<
  User,
  UserSnapshot
> {
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  /**
   * Persists a new user, caches the canonical id lookup and invalidates the
   * secondary email lookup so a previous negative/stale cache entry cannot hide
   * the newly-created aggregate.
   */
  @Cache<User, UserSnapshot>(
    (user) => filterCacheKey(User.aggregateName, { id: user.id }),
    null,
    (user) => [filterCacheKey(User.aggregateName, { email: user.email })],
  )
  @AcknowledgePersisted<[User]>({ entity: ([user]) => user })
  @MapPersistenceErrors<[User], User>({
    entity: ([user]) => user,
    unique: [
      {
        constraint: 'users_email_unique',
        columns: 'users.email',
        error: (user) => new UniqueEmailException(user),
      },
    ],
  })
  async save(user: User): Promise<UserSnapshot> {
    const em = this.store.em;
    const persistedUser = em.create(User, user);
    em.persist(persistedUser);
    await em.flush();
    return persistedUser.toJSON();
  }
}
