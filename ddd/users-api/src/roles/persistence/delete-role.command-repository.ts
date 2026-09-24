/* Copyright (C) 2026-present Aristotelis — see repository license. */

import { Inject, Injectable } from '@nestjs/common';
import { ICache } from '@nestjs-pipeline/ddd-core/application';
import {
  CACHE_TOKEN,
  Cache,
  filterCacheKey,
  MapPersistenceErrors,
  MikroOrmWriteSideCommandRepository,
  mapPersistenceError,
  optimisticDelete,
} from '@nestjs-pipeline/ddd-core/persistence';
import { cacheWriteLogger } from '@persistence/cache/cache-loggers';
import { MIKRO_ORM_CLIENT, MikroOrmStore } from '@persistence/mikro-orm.store';
import { Role, RoleSnapshot } from '../domain/models/role.entity';

@Injectable()
export class DeleteRoleCommandRepository extends MikroOrmWriteSideCommandRepository<
  RoleSnapshot,
  Role,
  null
> {
  constructor(
    @Inject(CACHE_TOKEN) cache: ICache<RoleSnapshot>,
    @Inject(MIKRO_ORM_CLIENT) store: MikroOrmStore,
  ) {
    super(cache, store, Role, Role.aggregateName, Role.fromJSON);
  }

  @Cache<Role, null>({
    logger: cacheWriteLogger,
    deleteKeys: (role) => [
      filterCacheKey(Role.aggregateName, { id: role.id }),
      filterCacheKey(Role.aggregateName, { name: role.name }),
    ],
  })
  @MapPersistenceErrors<[Role], Role>({
    entity: ([role]) => role,
    unique: [],
    otherwise: (error, role) =>
      mapPersistenceError(error, `deleting Role ${role.id}`),
  })
  async save(role: Role): Promise<null> {
    await optimisticDelete(this.store.em, Role, role, 'Role');
    return null;
  }
}
