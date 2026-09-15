/* Copyright (C) 2026-present Aristotelis — see repository license. */

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
