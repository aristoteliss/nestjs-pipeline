/* Copyright (C) 2026-present Aristotelis — see repository license. */
import { filterCacheKey } from '@common/cqrs/helpers/filterCacheKey.helper';
import { Inject, Injectable } from '@nestjs/common';
import { Cache, CommandRepository, ICache, IWriteSideAggregateRepository } from '@nestjs-pipeline/ddd-core';
import { CACHE_TOKEN } from '@persistence/cache/memory.cache';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { Role, RoleSnapshot } from '../domain/models/role.entity';

@Injectable()
export class DeleteRoleCommandRepository
  extends CommandRepository<Role, null>
  implements IWriteSideAggregateRepository<Role, RoleSnapshot, null>
{
  constructor(@Inject(CACHE_TOKEN) protected readonly cache: ICache<RoleSnapshot>, @Inject(MIKRO_ORM_CLIENT) private readonly store: MikroOrmStore) { super(cache); }

  /** Reads directly from primary persistence; command hydration never uses read-side cache. */
  async findById(id: string): Promise<RoleSnapshot | null> {
    const role = await this.store.em.findOne(Role, { id }, { refresh: true });
    return role?.toJSON() ?? null;
  }

  @Cache<Role, null>(null, (role) => [filterCacheKey(Role.aggregateName, { id: role.id })])
  async save(role: Role): Promise<null> {
    await this.store.em.nativeDelete(Role, { id: role.id });
    return null;
  }
}
