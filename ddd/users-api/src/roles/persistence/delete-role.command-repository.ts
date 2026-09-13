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
import { Role, RoleSnapshot } from '../domain/models/role.entity';

@Injectable()
export class DeleteRoleCommandRepository
  extends CommandRepository<Role, null>
  implements IWriteSideAggregateRepository<Role, RoleSnapshot, null>
{
  constructor(
    @Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore,
  ) {
    super(cache);
  }

  /**
   * Reads directly from primary persistence and translates retryable driver
   * failures into the application-neutral transient-operation signal.
   */
  async findById(id: string): Promise<RoleSnapshot | null> {
    try {
      const role = await this.store.em.findOne(Role, { id }, { refresh: true });
      return role?.toJSON() ?? null;
    } catch (error) {
      throw mapPersistenceError(error, `loading Role ${id}`);
    }
  }

  @Cache<Role, null>(null, (role) => [
    filterCacheKey(Role.aggregateName, { id: role.id }),
  ])
  async save(role: Role): Promise<null> {
    try {
      await this.store.em.nativeDelete(Role, { id: role.id });
      return null;
    } catch (error) {
      throw mapPersistenceError(error, `deleting Role ${role.id}`);
    }
  }
}
