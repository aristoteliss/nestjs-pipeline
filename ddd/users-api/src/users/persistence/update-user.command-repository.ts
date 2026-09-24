/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import { ICache } from '@nestjs-pipeline/ddd-core/application';
import {
  CACHE_TOKEN,
  filterCacheKey,
  MikroOrmWriteSideCommandRepository,
  optimisticUpdate,
  PersistedWrite,
} from '@nestjs-pipeline/ddd-core/persistence';
import { cacheWriteLogger } from '@persistence/cache/cache-loggers';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class UpdateUserCommandRepository extends MikroOrmWriteSideCommandRepository<
  UserSnapshot,
  User,
  UserSnapshot
> {
  constructor(
    @Inject(CACHE_TOKEN) cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) store: MikroOrmStore,
  ) {
    super(cache, store, User, User.aggregateName, User.fromJSON);
  }

  @PersistedWrite<User>({
    cache: {
      logger: cacheWriteLogger,
      setKey: (user) => filterCacheKey(User.aggregateName, { id: user.id }),
      invalidateKeys: (user) => [
        filterCacheKey(User.aggregateName, { email: user.email }),
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
