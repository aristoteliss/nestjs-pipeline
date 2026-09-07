/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { filterCacheKey } from '@common/cqrs/helpers/filterCacheKey.helper';
import { OptimisticLockError } from '@mikro-orm/core';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cache, CommandRepository, ICache, IWriteSideAggregateRepository } from '@nestjs-pipeline/ddd-core';
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
  ) { super(cache); }

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
  async save(user: User): Promise<UserSnapshot> {
    const affected = await this.store.em.nativeUpdate(
      User,
      { id: user.id, version: user.getExpectedVersion() },
      { username: user.username, department: user.department ?? null, updatedAt: user.updatedAt, version: user.version },
    );
    if (affected === 0) {
      const exists = await this.store.em.findOne(User, { id: user.id }, { refresh: true });
      if (exists) {
        throw OptimisticLockError.lockFailedVersionMismatch(user, user.getExpectedVersion(), exists.version);
      }
      throw new NotFoundException('User not found');
    }
    return user.toJSON();
  }
}
