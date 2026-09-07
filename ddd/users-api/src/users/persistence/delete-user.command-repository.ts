/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { filterCacheKey } from '@common/cqrs/helpers/filterCacheKey.helper';
import { Inject, Injectable } from '@nestjs/common';
import {
  Cache,
  CommandRepository,
  ICache,
  IWriteSideAggregateRepository,
} from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { mapPersistenceError } from '@persistence/is-transient-persistence-error';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class DeleteUserCommandRepository
  extends CommandRepository<User, null>
  implements IWriteSideAggregateRepository<User, UserSnapshot, null>
{
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  /**
   * Reads directly from primary persistence and translates retryable driver
   * failures into the application-neutral transient-operation signal.
   */
  async findById(id: string): Promise<UserSnapshot | null> {
    try {
      const user = await this.store.em.findOne(User, { id }, { refresh: true });
      return user?.toJSON() ?? null;
    } catch (error) {
      throw mapPersistenceError(error, `loading User ${id}`);
    }
  }

  @Cache<User, null>(null, (user) => [
    filterCacheKey(User.aggregateName, { id: user.id }),
    filterCacheKey(User.aggregateName, { email: user.email }),
  ])
  async save(user: User): Promise<null> {
    try {
      await this.store.em.nativeDelete(User, user.id);
      return null;
    } catch (error) {
      throw mapPersistenceError(error, `deleting User ${user.id}`);
    }
  }
}
