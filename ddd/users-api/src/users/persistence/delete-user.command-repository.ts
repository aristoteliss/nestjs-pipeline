/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { filterCacheKey } from '@common/cqrs/helpers/filterCacheKey.helper';
import { Inject, Injectable } from '@nestjs/common';
import { Cache, CommandRepository, ICache, IWriteSideAggregateRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
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
  ) { super(cache); }

  /** Reads directly from primary persistence; command hydration never uses read-side cache. */
  async findById(id: string): Promise<UserSnapshot | null> {
    const user = await this.store.em.findOne(User, { id }, { refresh: true });
    return user?.toJSON() ?? null;
  }

  @Cache<User, null>(null, (user) => [
    filterCacheKey(User.aggregateName, { id: user.id }),
    filterCacheKey(User.aggregateName, { email: user.email }),
  ])
  async save(user: User): Promise<null> {
    await this.store.em.nativeDelete(User, user.id);
    return null;
  }
}
