/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import {
  CACHE_TOKEN,
  Cache,
  filterCacheKey,
  MapPersistenceErrors,
  MikroOrmWriteSideCommandRepository,
  mapPersistenceError,
  optimisticDelete,
} from '@cqrs-ddd/core/persistence';
import { Inject, Injectable } from '@nestjs/common';
import { cacheWriteLogger } from '@persistence/cache/cache-loggers';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class DeleteUserCommandRepository extends MikroOrmWriteSideCommandRepository<
  UserSnapshot,
  User,
  null
> {
  constructor(
    @Inject(CACHE_TOKEN) cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) store: MikroOrmStore,
  ) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @Cache<User, null>({
    logger: cacheWriteLogger,
    deleteKeys: (user) => [
      filterCacheKey(User.aggregateName, { id: user.id }),
      filterCacheKey(User.aggregateName, { email: user.email }),
    ],
  })
  @MapPersistenceErrors<[User], User>({
    entity: ([user]) => user,
    unique: [],
    otherwise: (error, user) =>
      mapPersistenceError(error, `deleting User ${user.id}`),
  })
  async save(user: User): Promise<null> {
    await optimisticDelete(this.store.em, User, user, 'User');
    return null;
  }
}
