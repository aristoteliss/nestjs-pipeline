/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { ICache } from '@cqrs-ddd/core/application';
import { cacheKey, PersistedWrite } from '@cqrs-ddd/core/persistence';
import { AggregateRepository, optimisticUpdate } from '@cqrs-ddd/mikro-orm';
import { Inject, Injectable } from '@nestjs/common';
import { CACHE } from '@persistence/cache/cache.token.js';
import { cacheWriteLogger } from '@persistence/cache/cache-loggers.js';
import {
  MIKRO_ORM_CLIENT,
  MikroOrmStore,
} from '@persistence/mikro-orm.store.js';
import { User, UserSnapshot } from '../domain/models/user.entity.js';

@Injectable()
export class UpdateUserCommandRepository extends AggregateRepository<
  UserSnapshot,
  User,
  UserSnapshot
> {
  constructor(
    @Inject(CACHE) cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) store: MikroOrmStore,
  ) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @PersistedWrite<User>({
    cache: {
      logger: cacheWriteLogger,
      setKey: (user) => cacheKey(User.aggregateName, { id: user.id }),
      invalidateKeys: (user) => [
        cacheKey(User.aggregateName, { email: user.email }),
      ],
    },
  })
  async save(user: User): Promise<UserSnapshot> {
    const snapshot = user.toJSON();
    await optimisticUpdate(
      this.store.em,
      User,
      user,
      {
        username: snapshot.username,
        department: snapshot.department ?? null,
        updatedAt: snapshot.updatedAt,
      },
      'User',
    );
    return snapshot;
  }
}
