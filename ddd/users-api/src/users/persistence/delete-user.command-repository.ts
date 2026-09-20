/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import { ICache } from '@nestjs-pipeline/ddd-core/application';
import {
  ConcurrencyConflictError,
  EntityNotFoundException,
} from '@nestjs-pipeline/ddd-core/domain';
import {
  CACHE_TOKEN,
  Cache,
  filterCacheKey,
  MapPersistenceErrors,
} from '@nestjs-pipeline/ddd-core/persistence';
import { mapPersistenceError } from '@persistence/is-transient-persistence-error';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { MikroOrmWriteSideCommandRepository } from '@persistence/mikro-orm-write-side.command-repository';
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
    const affected = await this.store.em.nativeDelete(User, {
      id: user.id,
      version: user.getExpectedVersion(),
    });
    if (affected === 0) {
      const exists = await this.store.em.findOne(
        User,
        { id: user.id },
        { refresh: true },
      );
      if (exists) {
        throw new ConcurrencyConflictError(
          'User',
          user.id,
          user.getExpectedVersion(),
          exists.version,
        );
      }
      throw new EntityNotFoundException('User', user.id);
    }
    return null;
  }
}
