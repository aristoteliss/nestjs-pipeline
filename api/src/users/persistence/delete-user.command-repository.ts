/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import {
  Cache,
  cacheKey,
  MapPersistenceErrors,
} from '@cqrs-ddd/core/persistence';
import {
  AggregateRepository,
  mapPersistenceError,
  optimisticDelete,
} from '@cqrs-ddd/mikro-orm';
import { Inject, Injectable } from '@nestjs/common';
import { CACHE } from '@persistence/cache/cache.token.js';
import { cacheWriteLogger } from '@persistence/cache/cache-loggers.js';
import {
  MIKRO_ORM_CLIENT,
  MikroOrmStore,
} from '@persistence/mikro-orm.store.js';
import { User, UserSnapshot } from '../domain/models/user.entity.js';

@Injectable()
export class DeleteUserCommandRepository extends AggregateRepository<
  UserSnapshot,
  User,
  null
> {
  constructor(
    @Inject(CACHE) cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) store: MikroOrmStore,
  ) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @Cache<User, null>({
    logger: cacheWriteLogger,
    deleteKeys: (user) => [
      cacheKey(User.aggregateName, { id: user.id }),
      cacheKey(User.aggregateName, { email: user.email }),
    ],
  })
  @MapPersistenceErrors<[User], User>({
    entity: ([user]) => user,
    otherwise: (error, user) =>
      mapPersistenceError(error, `deleting User ${user.id}`),
  })
  async save(user: User): Promise<null> {
    await optimisticDelete(this.store.em, User, user, 'User');
    return null;
  }
}
