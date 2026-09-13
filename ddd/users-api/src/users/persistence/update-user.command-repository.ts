/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { filterCacheKey } from '@common/cqrs/helpers/filterCacheKey.helper';
import { Inject, Injectable } from '@nestjs/common';
import {
  AcknowledgePersisted,
  Cache,
  CommandRepository,
  ICache,
  IWriteSideAggregateRepository,
  MapPersistenceErrors,
  optimisticUpdate,
} from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { User, UserSnapshot } from '../domain/models/user.entity';

@Injectable()
export class UpdateUserCommandRepository
  extends CommandRepository<User, UserSnapshot>
  implements IWriteSideAggregateRepository<User, UserSnapshot, UserSnapshot>
{
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<UserSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  /** Reads directly from primary persistence; command hydration never uses read-side cache. */
  async findById(id: string): Promise<UserSnapshot | null> {
    const user = await this.store.em.findOne(User, { id }, { refresh: true });
    return user?.toJSON() ?? null;
  }

  @Cache<User, UserSnapshot>(
    (user) => filterCacheKey(User.aggregateName, { id: user.id }),
    null,
    (user) => [filterCacheKey(User.aggregateName, { email: user.email })],
  )
  @AcknowledgePersisted<[User]>({ entity: ([user]) => user })
  @MapPersistenceErrors<[User], User>({
    entity: ([user]) => user,
    unique: [],
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
