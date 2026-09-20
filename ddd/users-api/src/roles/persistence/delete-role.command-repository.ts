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
    const affected = await this.store.em.nativeDelete(Role, {
      id: role.id,
      version: role.getExpectedVersion(),
    });
    if (affected === 0) {
      const exists = await this.store.em.findOne(
        Role,
        { id: role.id },
        { refresh: true },
      );
      if (exists) {
        throw new ConcurrencyConflictError(
          'Role',
          role.id,
          role.getExpectedVersion(),
          exists.version,
        );
      }
      throw new EntityNotFoundException('Role', role.id);
    }
    return null;
  }
}
